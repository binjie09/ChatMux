package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

const terminalImageUploadDir = "/tmp/chatmux-clipboard-images"

type terminalImageUploadRequest struct {
	CredentialToken string `json:"credentialToken"`
	DataBase64      string `json:"dataBase64"`
	MimeType        string `json:"mimeType"`
}

type terminalImageUploadResponse struct {
	RemotePath string `json:"remotePath"`
}

func (s *Server) handleUploadTerminalImage(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, ok := routeHostSessionAction(r.URL.Path, "/terminal-images")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}

	var input terminalImageUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	credential, err := s.sshCredentialForRequest(r, hostID, input.CredentialToken)
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}
	payload, extension, err := decodeTerminalImage(input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	remotePath := terminalImageRemotePath(extension)
	if err := s.ssh.WriteFile(r.Context(), hostToSSHConfig(host), credential, remotePath, payload); err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{
		Type: "terminal.image.uploaded", HostID: hostID, SessionName: sessionName,
		Message: fmt.Sprintf("uploaded terminal image (%d bytes)", len(payload)),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, terminalImageUploadResponse{RemotePath: remotePath})
}

func decodeTerminalImage(input terminalImageUploadRequest) ([]byte, string, error) {
	extension, ok := terminalImageExtension(input.MimeType)
	if !ok {
		return nil, "", fmt.Errorf("unsupported terminal image type: %s", input.MimeType)
	}
	data, err := base64.StdEncoding.DecodeString(input.DataBase64)
	if err != nil {
		return nil, "", fmt.Errorf("decode terminal image: %w", err)
	}
	if len(data) == 0 {
		return nil, "", errors.New("terminal image is empty")
	}
	return data, extension, nil
}

func terminalImageExtension(mimeType string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "image/png":
		return ".png", true
	case "image/jpeg", "image/jpg":
		return ".jpg", true
	case "image/gif":
		return ".gif", true
	case "image/webp":
		return ".webp", true
	default:
		return "", false
	}
}

func terminalImageRemotePath(extension string) string {
	return fmt.Sprintf("%s/chatmux-%d%s", terminalImageUploadDir, time.Now().UnixNano(), extension)
}
