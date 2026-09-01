package catalog

import (
	"context"

	"google.golang.org/grpc"

	pb "shop/catalog-service/pb"
)

// Client wraps the CatalogService gRPC stub.
type Client struct {
	rpc pb.CatalogServiceClient
}

func Dial(target string) (*Client, error) {
	conn, err := grpc.Dial(target, grpc.WithInsecure())
	if err != nil {
		return nil, err
	}
	// gRPC client construction — storefront calls catalog-service.
	client := pb.NewCatalogServiceClient(conn)
	return &Client{rpc: client}, nil
}

func (c *Client) GetItem(ctx context.Context, id string) (*pb.Item, error) {
	return c.rpc.GetItem(ctx, &pb.GetItemRequest{Id: id})
}
