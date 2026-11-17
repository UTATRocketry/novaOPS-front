import { novaFetch } from "./novaFetch";

/** Extra MQTT topic filters the backend is subscribed to (beyond the built-in ones). */
export interface MqttTopicsResponse {
  topics: string[];
}

/** List the ad-hoc subscriptions. Open to every role. */
export function getMqttTopics(): Promise<MqttTopicsResponse> {
  return novaFetch<MqttTopicsResponse>("/api/mqtt/topics");
}

/**
 * Subscribe the backend to a topic filter (`+` / `#` allowed). Its messages then
 * arrive over the WebSocket as `mqtt_message`. Operator or admin role required.
 */
export function subscribeMqttTopic(topic: string, clientId: string): Promise<MqttTopicsResponse> {
  return novaFetch<MqttTopicsResponse>(
    "/api/mqtt/topics",
    { method: "POST", body: JSON.stringify({ topic }) },
    clientId,
  );
}

/** Drop an ad-hoc subscription. Operator or admin role required. */
export function unsubscribeMqttTopic(topic: string, clientId: string): Promise<MqttTopicsResponse> {
  return novaFetch<MqttTopicsResponse>(
    "/api/mqtt/topics/unsubscribe",
    { method: "POST", body: JSON.stringify({ topic }) },
    clientId,
  );
}
