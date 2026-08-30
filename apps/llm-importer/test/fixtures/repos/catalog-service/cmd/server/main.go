package main

import (
	"log"
	"net"

	"google.golang.org/grpc"

	pb "shop/catalog-service/pb"
)

type server struct {
	pb.UnimplementedCatalogServiceServer
}

func (s *server) GetItem(req *pb.GetItemRequest, _ grpc.ServerStream) error {
	return nil
}

func main() {
	lis, err := net.Listen("tcp", ":8080")
	if err != nil {
		log.Fatal(err)
	}
	s := grpc.NewServer()
	pb.RegisterCatalogServiceServer(s, &server{})
	log.Fatal(s.Serve(lis))
}
