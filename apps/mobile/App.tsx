import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { LoadingCenter } from './src/components/ui';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { TaskListScreen } from './src/screens/TaskListScreen';
import { TaskDetailScreen } from './src/screens/TaskDetailScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import type { AppStackParamList, AuthStackParamList } from './src/navigation/types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function RootNavigator() {
  const { token, loading } = useAuth();

  if (loading) return <LoadingCenter />;

  if (!token) {
    return (
      <AuthStack.Navigator>
        <AuthStack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: '登入' }}
        />
        <AuthStack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ title: '註冊' }}
        />
      </AuthStack.Navigator>
    );
  }

  return (
    <AppStack.Navigator>
      <AppStack.Screen
        name="Tasks"
        component={TaskListScreen}
        options={{ title: '可填問卷', headerShown: false }}
      />
      <AppStack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: '問卷詳情' }}
      />
      <AppStack.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: '填答紀錄' }}
      />
    </AppStack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
          <StatusBar style="dark" />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
