import { Kafka } from 'kafkajs';

const kafka = new Kafka({ brokers: ['localhost:9092'] });
const consumer = kafka.consumer({ groupId: 'notification-service' });

/** Consumes the user-created topic published by user-service. */
export async function consumeUserCreated() {
  await consumer.subscribe({ topic: 'user-created' });
}
