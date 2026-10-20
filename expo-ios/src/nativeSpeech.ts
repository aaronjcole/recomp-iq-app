import { Alert } from "react-native";
import { requireOptionalNativeModule } from "expo";
import type { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import type { SpeechRecognizer } from "./speechCapture";

// A JS update cannot add native code to an old installed binary. Unlike the
// library's runtime entry point, this optional lookup does not crash that shell.
const speech = requireOptionalNativeModule<typeof ExpoSpeechRecognitionModule>("ExpoSpeechRecognition");
function moduleOrThrow() {
  if (!speech) throw new Error("unavailable");
  return speech;
}

export const nativeSpeechRecognizer: SpeechRecognizer = {
  available: () => speech?.isRecognitionAvailable() === true,
  requestPermissions: () => moduleOrThrow().requestPermissionsAsync(),
  listen: (handlers) => {
    const module = moduleOrThrow();
    const listeners = [
      module.addListener("result", (event) => handlers.result(event.results[0]?.transcript, event.isFinal)),
      module.addListener("end", handlers.end),
      module.addListener("error", (event) => handlers.error(event.error))
    ];
    return () => listeners.forEach((listener) => listener.remove());
  },
  start: () => moduleOrThrow().start({
    lang: "en-US", continuous: false, interimResults: false, maxAlternatives: 1,
    recordingOptions: { persist: false }
  }),
  stop: () => moduleOrThrow().stop(),
  abort: () => moduleOrThrow().abort()
};

export function confirmSpeechConsent(): Promise<boolean> {
  return new Promise((resolve) => Alert.alert(
    "Describe your meal by voice?",
    "Your microphone is used only for this recording (up to 60 seconds). Apple may process speech online. RecompOne does not save audio. Only final text is added for you to review; nothing is logged automatically.",
    [{ text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Continue", onPress: () => resolve(true) }],
    { cancelable: true, onDismiss: () => resolve(false) }
  ));
}
