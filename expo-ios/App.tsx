import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";

import { RecompOneWebView } from "./src/RecompOneWebView";

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <RecompOneWebView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#07121d",
    flex: 1
  }
});
