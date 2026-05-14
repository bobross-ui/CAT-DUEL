import { useState, useEffect } from 'react';
import { Image, View } from 'react-native';

type Props = {
  uri: string;
  style?: object;
};

export default function AutoImage({ uri, style }: Props) {
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    Image.getSize(uri, (w, h) => {
      if (w > 0) setRatio(h / w);
    });
  }, [uri]);

  if (ratio === null) return <View style={[{ width: '100%', height: 160 }, style]} />;

  return (
    <Image
      source={{ uri }}
      resizeMode="contain"
      style={[{ width: '100%', aspectRatio: 1 / ratio }, style]}
    />
  );
}
