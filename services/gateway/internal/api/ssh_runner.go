package api

import (
	"context"

	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
)

type sshRunner interface {
	DeleteFile(context.Context, sshclient.HostConfig, sshclient.Credential, string) error
	ReadFile(context.Context, sshclient.HostConfig, sshclient.Credential, string) ([]byte, error)
	ReadDir(context.Context, sshclient.HostConfig, sshclient.Credential, string) ([]sshclient.FileEntry, string, error)
	Run(context.Context, sshclient.HostConfig, sshclient.Credential, string) ([]byte, error)
	ScanHostKey(context.Context, sshclient.HostConfig) (string, error)
	StartTerminal(context.Context, sshclient.HostConfig, sshclient.Credential, string, sshclient.TerminalSize) (*sshclient.Terminal, error)
	WriteFile(context.Context, sshclient.HostConfig, sshclient.Credential, string, []byte) error
}
