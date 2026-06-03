package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/muxchat/muxchat/services/gateway/internal/api"
	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

func main() {
	store, err := hoststore.Open(envOrDefault("MUXCHAT_DB", "muxchat.db"))
	if err != nil {
		log.Fatal(err)
	}
	defer store.Close()

	addr := envOrDefault("MUXCHAT_ADDR", ":8080")
	server := &http.Server{
		Addr:              addr,
		Handler:           api.NewServer(store).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("muxchat gateway listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func envOrDefault(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
