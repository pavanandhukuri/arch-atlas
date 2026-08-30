package main

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/segmentio/kafka-go"
)

// consumes the user-created topic published by user-service.
func consume(ctx context.Context) {
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers: []string{"localhost:9092"},
		Topic:   "user-created",
		GroupID: "audit-service",
	})
	_, _ = r.ReadMessage(ctx)
}

func record(ctx context.Context, conn *pgx.Conn, actor string) error {
	_, err := conn.Exec(ctx, "INSERT INTO audit_log (actor) VALUES ($1)", actor)
	return err
}

func main() {}
