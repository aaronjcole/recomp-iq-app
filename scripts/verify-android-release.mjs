import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const live = args.includes("--live");

const aabFlagIndex = args.findIndex((argument) => argument === "--aab");
const inlineAab = args.find((argument) => argument.startsWith("--aab="));
const aabPath = process.env.AAB_PATH
  || (inlineAab ? inlineAab.slice("--aab=".length) : null)
  || (aabFlagIndex >= 0 ? args[aabFlagIndex + 1] : null);

const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
}

function pngDimensions(path) {
  return pngDimensionsFromBytes(readFileSync(path), path);
}

function pngDimensionsFromBytes(bytes, label) {
  check(
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `${label} is not a PNG file`,
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function normalizeFingerprint(value) {
  return value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
    failures.push(`${command} ${commandArgs.join(" ")} failed: ${detail}`);
    return "";
  }
  return result.stdout;
}

function readArchiveEntry(archivePath, entry) {
  const result = spawnSync("unzip", ["-p", archivePath, entry], {
    encoding: null,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.toString().trim() || `exit ${result.status}`;
    failures.push(`unable to inspect ${entry}: ${detail}`);
    return null;
  }
  return result.stdout;
}

function minimumElfLoadAlignment(bytes) {
  if (
    !bytes
    || bytes.length < 64
    || bytes[0] !== 0x7f
    || bytes.toString("ascii", 1, 4) !== "ELF"
    || bytes[5] !== 1
  ) return null;

  const elfClass = bytes[4];
  if (elfClass !== 1 && elfClass !== 2) return null;
  const programHeaderOffset = elfClass === 2
    ? Number(bytes.readBigUInt64LE(32))
    : bytes.readUInt32LE(28);
  const programHeaderSize = elfClass === 2 ? bytes.readUInt16LE(54) : bytes.readUInt16LE(42);
  const programHeaderCount = elfClass === 2 ? bytes.readUInt16LE(56) : bytes.readUInt16LE(44);
  let minimum = Number.POSITIVE_INFINITY;

  for (let index = 0; index < programHeaderCount; index += 1) {
    const offset = programHeaderOffset + index * programHeaderSize;
    if (offset + programHeaderSize > bytes.length || bytes.readUInt32LE(offset) !== 1) continue;
    const alignment = elfClass === 2
      ? Number(bytes.readBigUInt64LE(offset + 48))
      : bytes.readUInt32LE(offset + 28);
    minimum = Math.min(minimum, alignment);
  }
  return Number.isFinite(minimum) ? minimum : null;
}

const config = readJson("android/play-release.json");
const manifest = readJson("public/manifest.json");

check(config.schemaVersion === 1, "android/play-release.json must use schemaVersion 1");
check(config.packagingProvider === "base44", "the release must use Base44's managed mobile package");
check(/^com\.base[a-z0-9]+\.app$/.test(config.packageName), "the Base44 package name is invalid");
check(config.minimumTargetSdk >= 36, "minimumTargetSdk must be API 36 or newer");
check(new URL(config.webOrigin).protocol === "https:", "webOrigin must use HTTPS");
check(manifest.id === "/", "the PWA manifest id must remain stable at /");
check(manifest.start_url === "/", "the PWA start_url must remain /");
check(manifest.scope === "/", "the PWA scope must cover the full origin");
check(manifest.display === config.requiredDisplayMode, `manifest display must be ${config.requiredDisplayMode}`);
check(manifest.orientation === config.requiredOrientation, `manifest orientation must be ${config.requiredOrientation}`);
check(manifest.theme_color === config.requiredThemeColor, "manifest theme color differs from Android branding");
check(manifest.background_color === config.requiredBackgroundColor, "manifest background color differs from Android branding");

for (const requirement of [
  { size: 192, purpose: "any" },
  { size: 512, purpose: "any" },
  { size: 512, purpose: "maskable" },
]) {
  const icon = manifest.icons.find((candidate) => (
    candidate.sizes === `${requirement.size}x${requirement.size}`
      && candidate.purpose?.split(/\s+/).includes(requirement.purpose)
  ));
  check(Boolean(icon), `manifest needs a ${requirement.size}px ${requirement.purpose} icon`);
  if (!icon) continue;

  const iconPath = resolve(repoRoot, "public", icon.src.replace(/^\//, ""));
  check(existsSync(iconPath), `manifest icon is missing: ${icon.src}`);
  if (!existsSync(iconPath)) continue;
  const dimensions = pngDimensions(iconPath);
  check(
    dimensions.width === requirement.size && dimensions.height === requirement.size,
    `${icon.src} must be ${requirement.size}x${requirement.size}`,
  );
}

async function verifyLiveDeployment() {
  const rootUrl = new URL("/", config.webOrigin);
  const rootResponse = await fetch(rootUrl, { redirect: "manual" });
  check(rootResponse.status === 200, `${rootUrl} must return 200 to verify response headers`);
  const contentSecurityPolicy = rootResponse.headers.get("content-security-policy") || "";
  const frameAncestors = contentSecurityPolicy.match(
    /(?:^|;)\s*frame-ancestors\s+([^;]+)/i,
  )?.[1]?.trim();
  const xFrameOptions = (rootResponse.headers.get("x-frame-options") || "")
    .trim()
    .toUpperCase();
  const protectedByCsp = Boolean(
    frameAncestors
    && !/(?:^|\s)\*(?:\s|$)/.test(frameAncestors)
    && !/\bhttps?:\s*(?:;|$)/i.test(frameAncestors),
  );
  const protectedByLegacyHeader = ["DENY", "SAMEORIGIN"].includes(xFrameOptions);
  check(
    protectedByCsp || protectedByLegacyHeader,
    `${rootUrl} must block third-party framing with CSP frame-ancestors or X-Frame-Options`,
  );
  if (!protectedByCsp && protectedByLegacyHeader) {
    notes.push(
      `Production framing is blocked by X-Frame-Options: ${xFrameOptions}; ask Base44 to also emit a restrictive CSP frame-ancestors directive.`,
    );
  }

  const manifestUrl = new URL(config.manifestPath, config.webOrigin);
  const manifestResponse = await fetch(manifestUrl);
  check(manifestResponse.ok, `${manifestUrl} returned ${manifestResponse.status}`);
  check(
    manifestResponse.headers.get("content-type")?.includes("application/json"),
    `${manifestUrl} must return application/json`,
  );
  if (manifestResponse.ok) {
    const deployedManifest = await manifestResponse.json();
    for (const key of ["name", "short_name", "id", "start_url", "scope", "display", "orientation"]) {
      check(deployedManifest[key] === manifest[key], `deployed manifest ${key} differs from the repository`);
    }
  }

  const managedManifestUrl = new URL(config.base44ManagedManifestPath, config.webOrigin);
  const managedManifestResponse = await fetch(managedManifestUrl);
  check(managedManifestResponse.ok, `${managedManifestUrl} returned ${managedManifestResponse.status}`);
  check(
    managedManifestResponse.headers.get("content-type")?.includes("application/json"),
    `${managedManifestUrl} must return application/json`,
  );
  if (managedManifestResponse.ok) {
    const managedManifest = await managedManifestResponse.json();
    check(managedManifest.name === manifest.name, "Base44 mobile name differs from the repository manifest");
    check(managedManifest.short_name === manifest.short_name, "Base44 mobile short name differs from the repository manifest");
    check(managedManifest.display === config.requiredDisplayMode, "Base44 mobile display mode is invalid");
    check(
      new URL(managedManifest.start_url).origin === config.webOrigin
        && new URL(managedManifest.start_url).pathname === "/",
      "Base44 mobile start URL must use the production origin root",
    );
    check(new URL(managedManifest.scope).origin === config.webOrigin, "Base44 mobile scope uses the wrong origin");
    if (managedManifest.theme_color?.toLowerCase() !== config.requiredThemeColor) {
      notes.push(
        `Base44-managed theme color is ${managedManifest.theme_color}; ${config.requiredThemeColor} remains the desired brand color.`,
      );
    }
    if (managedManifest.background_color?.toLowerCase() !== config.requiredBackgroundColor) {
      notes.push(
        `Base44-managed background color is ${managedManifest.background_color}; ${config.requiredBackgroundColor} remains the desired brand color.`,
      );
    }

    const managedIcon = managedManifest.icons?.find((icon) => icon.sizes === "512x512");
    check(Boolean(managedIcon), "Base44 mobile manifest needs a 512x512 icon");
    if (managedIcon) {
      const managedIconUrl = new URL(managedIcon.src, config.webOrigin);
      const managedIconResponse = await fetch(managedIconUrl);
      check(managedIconResponse.ok, `${managedIconUrl} returned ${managedIconResponse.status}`);
      check(
        managedIconResponse.headers.get("content-type")?.includes("image/png"),
        "Base44 mobile icon must be a PNG",
      );
      if (managedIconResponse.ok) {
        const managedIconBytes = Buffer.from(await managedIconResponse.arrayBuffer());
        const dimensions = pngDimensionsFromBytes(managedIconBytes, managedIconUrl.toString());
        check(dimensions.width >= 512 && dimensions.height >= 512, "Base44 mobile icon is smaller than 512px");
        check(
          managedIconBytes.equals(readFileSync(resolve(repoRoot, config.managedIconAsset))),
          "Base44 mobile icon differs from the approved Play icon",
        );
      }
    }
  }

  const assetLinksUrl = new URL(config.assetLinksPath, config.webOrigin);
  const assetLinksResponse = await fetch(assetLinksUrl);
  check(assetLinksResponse.ok, `${assetLinksUrl} returned ${assetLinksResponse.status}`);
  check(
    assetLinksResponse.headers.get("content-type")?.includes("application/json"),
    `${assetLinksUrl} must return application/json`,
  );
  if (assetLinksResponse.ok) {
    const statements = await assetLinksResponse.json();
    const association = statements.find((statement) => (
      statement.target?.namespace === "android_app"
        && statement.target?.package_name === config.packageName
        && statement.relation?.includes("delegate_permission/common.handle_all_urls")
    ));
    check(Boolean(association), `assetlinks.json does not authorize ${config.packageName}`);
    const fingerprints = association?.target?.sha256_cert_fingerprints || [];
    check(fingerprints.length > 0, "assetlinks.json needs at least one SHA-256 certificate fingerprint");
    for (const fingerprint of fingerprints) {
      check(normalizeFingerprint(fingerprint).length === 64, `invalid SHA-256 fingerprint: ${fingerprint}`);
    }

    const playFingerprint = process.env.PLAY_APP_SIGNING_SHA256;
    if (playFingerprint) {
      check(
        fingerprints.some((fingerprint) => (
          normalizeFingerprint(fingerprint) === normalizeFingerprint(playFingerprint)
        )),
        "assetlinks.json does not contain PLAY_APP_SIGNING_SHA256",
      );
    } else {
      notes.push(`Published Android fingerprints: ${fingerprints.join(", ")}`);
      notes.push("Set PLAY_APP_SIGNING_SHA256 after Play App Signing is enabled to verify the production certificate.");
    }
  }

  for (const path of config.requiredPublicPaths) {
    const url = new URL(path, config.webOrigin);
    const response = await fetch(url, { redirect: "manual" });
    check(response.status === 200, `${url} must be publicly reachable (received ${response.status})`);
    check(
      response.headers.get("content-type")?.includes("text/html"),
      `${url} must return HTML`,
    );
  }
}

function inspectAab(pathValue) {
  if (!pathValue || pathValue.startsWith("--")) {
    failures.push("--aab requires a path, or set AAB_PATH");
    return;
  }

  const absoluteAabPath = resolve(pathValue);
  check(existsSync(absoluteAabPath), `AAB not found: ${absoluteAabPath}`);
  if (!existsSync(absoluteAabPath)) return;

  const bundletoolJar = process.env.BUNDLETOOL_JAR;
  const javaBin = process.env.JAVA_BIN || "java";
  check(Boolean(bundletoolJar), "set BUNDLETOOL_JAR to inspect an AAB");
  if (!bundletoolJar) return;
  check(existsSync(bundletoolJar), `bundletool not found: ${bundletoolJar}`);
  if (!existsSync(bundletoolJar)) return;

  const dumpedManifest = run(javaBin, [
    "-jar",
    bundletoolJar,
    "dump",
    "manifest",
    `--bundle=${absoluteAabPath}`,
    "--module=base",
  ]);
  if (!dumpedManifest) return;

  const packageName = dumpedManifest.match(/<manifest[^>]*\bpackage="([^"]+)"/)?.[1];
  const versionCode = Number(dumpedManifest.match(/android:versionCode="(\d+)"/)?.[1]);
  const versionName = dumpedManifest.match(/android:versionName="([^"]+)"/)?.[1];
  const targetSdk = Number(
    dumpedManifest.match(/android:targetSdkVersion="(\d+)"/)?.[1]
      || dumpedManifest.match(/targetSdkVersion[^\d]+(\d+)/)?.[1],
  );
  const permissions = new Set(
    [...dumpedManifest.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)]
      .map((match) => match[1]),
  );
  const requiredFeatures = new Set(
    [...dumpedManifest.matchAll(/<uses-feature\b([^>]*)>/g)]
      .map((match) => match[1])
      .filter((attributes) => !/android:required="false"/.test(attributes))
      .map((attributes) => attributes.match(/android:name="([^"]+)"/)?.[1])
      .filter(Boolean),
  );

  check(packageName === config.packageName, `AAB package is ${packageName || "unknown"}`);
  check(versionCode > 0, `AAB versionCode is ${versionCode || "missing"}`);
  check(Boolean(versionName), "AAB versionName is missing");
  check(targetSdk >= config.minimumTargetSdk, `AAB targetSdk is ${targetSdk || "unknown"}; API ${config.minimumTargetSdk}+ is required`);
  check(!/android:debuggable="true"/.test(dumpedManifest), "AAB application is debuggable");
  check(!/android:usesCleartextTraffic="true"/.test(dumpedManifest), "AAB permits cleartext traffic");
  check(!/<data[^>]*android:scheme="http"/.test(dumpedManifest), "AAB declares a cleartext HTTP intent route");
  for (const permission of config.requiredAndroidPermissions) {
    check(permissions.has(permission), `AAB is missing required permission ${permission}`);
  }
  for (const permission of config.forbiddenAndroidPermissions) {
    check(!permissions.has(permission), `AAB includes forbidden permission ${permission}`);
  }
  for (const feature of config.forbiddenRequiredAndroidFeatures) {
    check(!requiredFeatures.has(feature), `AAB requires unrelated hardware feature ${feature}`);
  }

  const keytoolBin = process.env.KEYTOOL_BIN || resolve(dirname(javaBin), "keytool");
  check(existsSync(keytoolBin), `keytool not found: ${keytoolBin}`);
  if (existsSync(keytoolBin)) {
    const certificate = run(keytoolBin, ["-printcert", "-jarfile", absoluteAabPath]);
    const fingerprint = certificate.match(/SHA256:\s*([A-Fa-f0-9:]+)/)?.[1];
    check(Boolean(fingerprint), "AAB signing certificate SHA-256 is missing");
    if (fingerprint) {
      check(
        normalizeFingerprint(fingerprint) === normalizeFingerprint(config.base44UploadCertificateSha256),
        "AAB is not signed with the expected Base44 upload certificate",
      );
      notes.push(`AAB upload certificate: ${fingerprint}`);
    }
  }

  const archiveEntries = run("unzip", ["-Z1", absoluteAabPath]).split("\n").filter(Boolean);
  const nativeLibraries = archiveEntries.filter((entry) => entry.endsWith(".so"));
  if (nativeLibraries.length === 0) {
    notes.push("AAB contains no native .so libraries; the 16 KB native page-size requirement is not applicable.");
  } else {
    const pageSizeLibraries = nativeLibraries.filter((entry) => (
      /\/lib\/(?:arm64-v8a|x86_64)\//.test(entry)
    ));
    const incompatibleLibraries = [];
    for (const entry of pageSizeLibraries) {
      const alignment = minimumElfLoadAlignment(readArchiveEntry(absoluteAabPath, entry));
      if (alignment !== null && alignment < 16 * 1024) {
        incompatibleLibraries.push(`${entry} (${alignment}-byte alignment)`);
      }
    }
    check(
      incompatibleLibraries.length === 0,
      `AAB has native libraries that are not 16 KB aligned: ${incompatibleLibraries.join(", ")}`,
    );
    notes.push(
      `AAB contains ${nativeLibraries.length} native libraries; ${pageSizeLibraries.length} 64-bit libraries pass ELF 16 KB alignment checks.`,
    );
  }

  const isTwa = dumpedManifest.includes("com.google.androidbrowserhelper.trusted.LauncherActivity");
  const wrapperType = isTwa ? "twa" : "base44-webview";
  check(wrapperType === config.expectedWrapperType, `AAB wrapper is ${wrapperType}, expected ${config.expectedWrapperType}`);
  if (isTwa) {
    check(/<intent-filter[^>]*android:autoVerify="true"/.test(dumpedManifest), "TWA intent filter must enable autoVerify");
  }
  notes.push(`AAB version: ${versionName || "unknown"} (${versionCode || "unknown"})`);
  notes.push(`AAB wrapper type: ${wrapperType}`);
  notes.push(`AAB required hardware: ${[...requiredFeatures].sort().join(", ") || "none"}`);
  notes.push(`AAB permissions: ${[...permissions].sort().join(", ") || "none"}`);
}

if (live) await verifyLiveDeployment();
if (aabFlagIndex >= 0 || inlineAab || process.env.AAB_PATH) inspectAab(aabPath);

if (failures.length > 0) {
  console.error("Android release verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Android release verification passed${live ? " (repository + live deployment)" : ""}.`);
}
for (const note of notes) console.log(`- ${note}`);
