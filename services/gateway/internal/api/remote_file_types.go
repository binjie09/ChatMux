package api

import "time"

const defaultFileTreePath = "."

type remoteFileRequest struct {
	CredentialToken string `json:"credentialToken"`
	Path            string `json:"path"`
	tmuxTargetRequest
}

type remoteFileUploadRequest struct {
	CredentialToken string `json:"credentialToken"`
	DataBase64      string `json:"dataBase64"`
	Directory       string `json:"directory"`
	FileName        string `json:"fileName"`
	tmuxTargetRequest
}

type remoteFileEntry struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	Size    int64     `json:"size"`
	Mode    string    `json:"mode"`
	ModTime time.Time `json:"modTime"`
	IsDir   bool      `json:"isDir"`
}

type remoteFileListResponse struct {
	Path    string            `json:"path"`
	Parent  string            `json:"parent"`
	Entries []remoteFileEntry `json:"entries"`
}

type remoteFileResolveResponse struct {
	Path string `json:"path"`
}

type remoteFileUploadResponse struct {
	RemotePath string `json:"remotePath"`
}
