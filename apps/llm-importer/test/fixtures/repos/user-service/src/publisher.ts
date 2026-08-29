import { Kafka } from 'kafkajs';

const kafka = new Kafka({ brokers: ['localhost:9092'] });
const producer = kafka.producer();

/** Publishes to the user-created topic, consumed by notification-service. */
export async function publishUserCreated(userId: string) {
  await producer.send({ topic: 'user-created', messages: [{ value: userId }] });
}
