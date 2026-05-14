export function imageUri(path: string): string {
  return `${process.env.EXPO_PUBLIC_API_URL}/${path}`;
}
