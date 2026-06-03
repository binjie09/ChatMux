package api

import (
	"context"

	"github.com/muxchat/muxchat/services/gateway/internal/sshclient"
)

type sshRunner interface {
	Run(context.Context, sshclient.HostConfig, sshclient.PasswordCredential, string) ([]byte, error)
}
