package api

import (
	"context"

	"github.com/muxchat/muxchat/services/gateway/internal/sshclient"
)

type sshRunner interface {
	Run(context.Context, sshclient.HostConfig, sshclient.PasswordCredential, string) ([]byte, error)
	ScanHostKey(context.Context, sshclient.HostConfig) (string, error)
	StartTerminal(context.Context, sshclient.HostConfig, sshclient.PasswordCredential, string, sshclient.TerminalSize) (*sshclient.Terminal, error)
}
