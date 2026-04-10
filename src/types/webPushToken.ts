export interface WebPushToken {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
