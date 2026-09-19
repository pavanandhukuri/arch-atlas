import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
});
const producer = kafka.producer();
const connected = producer.connect();

/** Thin wrapper so the rest of the service publishes domain events without knowing about Kafka. */
export const bus = {
  async publish(topic: string, event: unknown): Promise<void> {
    await connected;
    await producer.send({ topic, messages: [{ value: JSON.stringify(event) }] });
  },
};
