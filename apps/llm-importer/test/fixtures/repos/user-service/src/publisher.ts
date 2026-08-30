import { Kafka } from 'kafkajs';

const kafka = new Kafka({ brokers: ['localhost:9092'] });
const producer = kafka.producer();

/** Publishes to the user-created topic, consumed by notification-service and audit-service. */
export async function publishUserCreated(userId: string) {
  await producer.publish('user-created', { value: userId });
}
