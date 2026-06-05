package api

import (
	"context"

	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
)

type sshRunner interface {
	Run(context.Context, sshclient.HostConfig, sshclient.Credential, string) ([]byte, error)
	ScanHostKey(context.Context, sshclient.HostConfig) (string, error)
	StartTerminal(context.Context, sshclient.HostConfig, sshclient.Credential, string, sshclient.TerminalSize) (*sshclient.Terminal, error)
	WriteFile(context.Context, sshclient.HostConfig, sshclient.Credential, string, []byte) error
}
