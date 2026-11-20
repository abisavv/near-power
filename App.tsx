
import { StatusBar } from 'expo-status-bar';
  import './global.css';
  import { SafeAreaProvider } from 'react-native-safe-area-context';
  import { Text,View } from 'react-native';
 import{Link} from 'expo-router'
export default function App() {
  return (
    
    <SafeAreaProvider>
    
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-xl font-bold text-success">
          Welcome!
        </Text>
        <Link href ="./Onboarding"> Go to Onbarding</Link>
      </View>
      <StatusBar style="auto" />
    
    </SafeAreaProvider>
    
  );
}
