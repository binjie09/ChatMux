package sshclient

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/pkg/sftp"
)

type FileEntry struct {
	Name    string
	Path    string
	Size    int64
	Mode    string
	ModTime time.Time
	IsDir   bool
}

func (c *Client) ReadFile(ctx context.Context, host HostConfig, credential Credential, path string) ([]byte, error) {
	if host.HostKeyFingerprint == "" {
		return nil, errors.New("host key is not trusted")
	}
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("remote path is required")
	}
	client, err := c.connect(ctx, host, credential)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return nil, fmt.Errorf("open sftp client: %w", err)
	}
	defer sftpClient.Close()
	file, err := sftpClient.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open remote file: %w", err)
	}
	defer file.Close()
	return io.ReadAll(file)
}

func (c *Client) ReadDir(ctx context.Context, host HostConfig, credential Credential, path string) ([]FileEntry, string, error) {
	if host.HostKeyFingerprint == "" {
		return nil, "", errors.New("host key is not trusted")
	}
	if strings.TrimSpace(path) == "" {
		path = "."
	}
	client, err := c.connect(ctx, host, credential)
	if err != nil {
		return nil, "", err
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return nil, "", fmt.Errorf("open sftp client: %w", err)
	}
	defer sftpClient.Close()
	return readRemoteDir(sftpClient, path)
}

func (c *Client) DeleteFile(ctx context.Context, host HostConfig, credential Credential, path string) error {
	if host.HostKeyFingerprint == "" {
		return errors.New("host key is not trusted")
	}
	if strings.TrimSpace(path) == "" {
		return errors.New("remote path is required")
	}
	client, err := c.connect(ctx, host, credential)
	if err != nil {
		return err
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return fmt.Errorf("open sftp client: %w", err)
	}
	defer sftpClient.Close()
	return deleteRemotePath(sftpClient, path)
}

func readRemoteDir(client *sftp.Client, path string) ([]FileEntry, string, error) {
	realPath, err := client.RealPath(path)
	if err != nil {
		return nil, "", fmt.Errorf("resolve remote path: %w", err)
	}
	infos, err := client.ReadDir(realPath)
	if err != nil {
		return nil, "", fmt.Errorf("read remote directory: %w", err)
	}
	entries := make([]FileEntry, 0, len(infos))
	for _, info := range infos {
		entries = append(entries, FileEntry{
			Name:    info.Name(),
			Path:    joinRemotePath(realPath, info.Name()),
			Size:    info.Size(),
			Mode:    info.Mode().String(),
			ModTime: info.ModTime(),
			IsDir:   info.IsDir(),
		})
	}
	return entries, realPath, nil
}

func deleteRemotePath(client *sftp.Client, path string) error {
	info, err := client.Lstat(path)
	if err != nil {
		return fmt.Errorf("stat remote path: %w", err)
	}
	if info.IsDir() {
		if err := client.RemoveDirectory(path); err != nil {
			return fmt.Errorf("delete remote directory: %w", err)
		}
		return nil
	}
	if err := client.Remove(path); err != nil {
		return fmt.Errorf("delete remote file: %w", err)
	}
	return nil
}

func joinRemotePath(dir string, name string) string {
	if dir == "/" {
		return "/" + name
	}
	return strings.TrimRight(dir, "/") + "/" + name
}
