package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
	"github.com/chatmux/chatmux/services/gateway/internal/tmux"
)

func (s *Server) handleResolveRemoteFilePath(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, input, ok := s.decodeRemoteFileRequest(w, r, "/files/resolve")
	if !ok {
		return
	}
	if strings.TrimSpace(input.Path) != "" {
		writeJSON(w, http.StatusOK, remoteFileResolveResponse{Path: remoteListPath(input.Path)})
		return
	}
	target, err := targetFromSessionRequest(sessionName, input.tmuxTargetRequest)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	command, err := tmux.CurrentPathCommand(target)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	host, credential, ok := s.remoteFileAccess(w, r, hostID, sessionName, input.CredentialToken)
	if !ok {
		return
	}
	output, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), credential, command)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, remoteFileResolveResponse{Path: normalizeRemotePathOutput(output)})
}

func (s *Server) handleListRemoteFiles(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, input, ok := s.decodeRemoteFileRequest(w, r, "/files/list")
	if !ok {
		return
	}
	s.handleRemoteFileListLikeResolve(w, r, hostID, sessionName, input)
}

func (s *Server) handleUploadRemoteFile(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, ok := routeHostSessionAction(r.URL.Path, "/files/upload")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	var input remoteFileUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	host, credential, ok := s.remoteFileAccess(w, r, hostID, sessionName, input.CredentialToken)
	if !ok {
		return
	}
	payload, err := base64.StdEncoding.DecodeString(input.DataBase64)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("decode remote file: %w", err))
		return
	}
	remotePath, err := uploadRemotePath(input.Directory, input.FileName)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.ssh.WriteFile(r.Context(), hostToSSHConfig(host), credential, remotePath, payload); err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusCreated, remoteFileUploadResponse{RemotePath: remotePath})
}

func (s *Server) handleDownloadRemoteFile(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, input, ok := s.decodeRemoteFileRequest(w, r, "/files/download")
	if !ok {
		return
	}
	host, credential, ok := s.remoteFileAccess(w, r, hostID, sessionName, input.CredentialToken)
	if !ok {
		return
	}
	remotePath := strings.TrimSpace(input.Path)
	if remotePath == "" {
		writeError(w, http.StatusBadRequest, errors.New("remote file path is required"))
		return
	}
	payload, err := s.ssh.ReadFile(r.Context(), hostToSSHConfig(host), credential, remotePath)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": path.Base(remotePath)}))
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(payload); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (s *Server) handleDeleteRemoteFile(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, input, ok := s.decodeRemoteFileRequest(w, r, "/files/delete")
	if !ok {
		return
	}
	host, credential, ok := s.remoteFileAccess(w, r, hostID, sessionName, input.CredentialToken)
	if !ok {
		return
	}
	remotePath := strings.TrimSpace(input.Path)
	if remotePath == "" {
		writeError(w, http.StatusBadRequest, errors.New("remote file path is required"))
		return
	}
	if err := s.ssh.DeleteFile(r.Context(), hostToSSHConfig(host), credential, remotePath); err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRemoteFileListLikeResolve(
	w http.ResponseWriter,
	r *http.Request,
	hostID string,
	sessionName string,
	input remoteFileRequest,
) {
	host, credential, ok := s.remoteFileAccess(w, r, hostID, sessionName, input.CredentialToken)
	if !ok {
		return
	}
	entries, realPath, err := s.ssh.ReadDir(r.Context(), hostToSSHConfig(host), credential, remoteListPath(input.Path))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, remoteFileListResponse{
		Path:    realPath,
		Parent:  remoteParent(realPath),
		Entries: remoteFileEntries(entries),
	})
}

func (s *Server) decodeRemoteFileRequest(
	w http.ResponseWriter,
	r *http.Request,
	suffix string,
) (string, string, remoteFileRequest, bool) {
	hostID, sessionName, ok := routeHostSessionAction(r.URL.Path, suffix)
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return "", "", remoteFileRequest{}, false
	}
	var input remoteFileRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return "", "", remoteFileRequest{}, false
	}
	return hostID, sessionName, input, true
}

func (s *Server) remoteFileAccess(
	w http.ResponseWriter,
	r *http.Request,
	hostID string,
	sessionName string,
	credentialToken string,
) (hoststore.Host, sshclient.Credential, bool) {
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return hoststore.Host{}, sshclient.Credential{}, false
	}
	if err := s.visibleSession(r, host, sessionName); err != nil {
		writeError(w, statusForSessionAccessError(err), err)
		return hoststore.Host{}, sshclient.Credential{}, false
	}
	credential, err := s.sshCredentialForRequest(r, hostID, credentialToken)
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return hoststore.Host{}, sshclient.Credential{}, false
	}
	return host, credential, true
}
