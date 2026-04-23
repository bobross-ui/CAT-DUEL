import Toast from 'react-native-toast-message';

export function showNetworkToast() {
  Toast.show({
    type: 'error',
    text1: "Couldn't connect",
    text2: 'Check your connection and try again.',
    position: 'top',
    visibilityTime: 2400,
    topOffset: 54,
  });
}
