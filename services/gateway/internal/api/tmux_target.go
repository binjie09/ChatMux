package api

import "github.com/chatmux/chatmux/services/gateway/internal/tmux"

type tmuxTargetRequest struct {
	WindowIndex *int `json:"windowIndex"`
}

func targetFromSessionRequest(sessionName string, input tmuxTargetRequest) (tmux.Target, error) {
	target := tmux.Target{SessionName: sessionName, WindowIndex: input.WindowIndex}
	if err := tmux.ValidateTarget(target); err != nil {
		return tmux.Target{}, err
	}
	return target, nil
}
