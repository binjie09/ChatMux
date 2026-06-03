package api

import "net/http"

const (
	automationCapabilityAuditRead        = "audit.read"
	automationCapabilityHostsRead        = "hosts.read"
	automationCapabilityTmuxHistoryRead  = "tmux.history.read"
	automationCapabilityTmuxSessionsRead = "tmux.sessions.read"
	automationToolHostsGet               = "hosts.get"
)

type automationToolRunner func(*Server, *http.Request, map[string]string) (any, error)

type automationToolDefinition struct {
	automationTool
	run automationToolRunner
}

func defaultAutomationCapabilities() []string {
	return []string{
		automationCapabilityAuditRead,
		automationCapabilityHostsRead,
		automationCapabilityTmuxHistoryRead,
		automationCapabilityTmuxSessionsRead,
	}
}

func automationCapabilitySet(capabilities []string) map[string]struct{} {
	set := map[string]struct{}{}
	for _, capability := range capabilities {
		if capability != "" {
			set[capability] = struct{}{}
		}
	}
	return set
}

func (s *Server) automationTools() []automationTool {
	definitions := s.allowedAutomationToolDefinitions()
	tools := make([]automationTool, 0, len(definitions))
	for _, definition := range definitions {
		tools = append(tools, definition.automationTool)
	}
	return tools
}

func (s *Server) runAutomationTool(r *http.Request, name string, args map[string]string) (any, error) {
	for _, definition := range s.allowedAutomationToolDefinitions() {
		if definition.Name == name {
			return definition.run(s, r, args)
		}
	}
	return nil, errUnknownAutomationTool
}

func (s *Server) allowedAutomationToolDefinitions() []automationToolDefinition {
	definitions := []automationToolDefinition{}
	for _, definition := range automationToolDefinitions() {
		if s.automationToolAllowed(definition) {
			definitions = append(definitions, definition)
		}
	}
	return definitions
}

func (s *Server) automationToolAllowed(definition automationToolDefinition) bool {
	for _, capability := range definition.Capabilities {
		if _, ok := s.automationCapabilities[capability]; !ok {
			return false
		}
	}
	return len(definition.Capabilities) > 0
}

func automationToolDefinitions() []automationToolDefinition {
	return []automationToolDefinition{
		automationHostsListDefinition(),
		automationHostsGetDefinition(),
		automationAuditListDefinition(),
		automationTmuxSessionsListDefinition(),
		automationTmuxHistoryCaptureDefinition(),
	}
}

func automationHostsListDefinition() automationToolDefinition {
	return automationToolDefinition{
		automationTool: automationTool{
			Name: automationToolHostsList, Description: "List visible hosts",
			Capabilities: []string{automationCapabilityHostsRead}, Inputs: []string{},
			RequiredRole: automationToolRequiredRole, SideEffect: automationToolSideEffectNone,
		},
		run: func(s *Server, r *http.Request, _ map[string]string) (any, error) {
			return s.runAutomationHostsList(r)
		},
	}
}

func automationHostsGetDefinition() automationToolDefinition {
	return automationToolDefinition{
		automationTool: automationTool{
			Name: automationToolHostsGet, Description: "Get one visible host",
			Capabilities: []string{automationCapabilityHostsRead}, Inputs: []string{"hostId"},
			RequiredRole: automationToolRequiredRole, SideEffect: automationToolSideEffectNone,
		},
		run: func(s *Server, r *http.Request, args map[string]string) (any, error) {
			return s.runAutomationHostsGet(r, args)
		},
	}
}

func automationAuditListDefinition() automationToolDefinition {
	return automationToolDefinition{
		automationTool: automationTool{
			Name: automationToolAuditList, Description: "List audit events",
			Capabilities: []string{automationCapabilityAuditRead}, Inputs: []string{},
			RequiredRole: automationToolRequiredRole, SideEffect: automationToolSideEffectNone,
		},
		run: func(s *Server, r *http.Request, _ map[string]string) (any, error) {
			return s.runAutomationAuditList(r)
		},
	}
}

func automationTmuxSessionsListDefinition() automationToolDefinition {
	return automationToolDefinition{
		automationTool: automationTool{
			Name: automationToolTmuxSessionsList, Description: "List tmux sessions over SSH",
			Capabilities: []string{automationCapabilityTmuxSessionsRead}, Inputs: []string{"hostId", "credentialToken"},
			RequiredRole: automationToolRequiredRole, SideEffect: automationToolSideEffectSSHRead,
		},
		run: func(s *Server, r *http.Request, args map[string]string) (any, error) {
			return s.runAutomationTmuxSessionsList(r, args)
		},
	}
}

func automationTmuxHistoryCaptureDefinition() automationToolDefinition {
	return automationToolDefinition{
		automationTool: automationTool{
			Name: automationToolTmuxHistoryCapture, Description: "Capture tmux pane history over SSH",
			Capabilities: []string{automationCapabilityTmuxHistoryRead}, Inputs: []string{"hostId", "sessionName", "credentialToken"},
			RequiredRole: automationToolRequiredRole, SideEffect: automationToolSideEffectSSHRead,
		},
		run: func(s *Server, r *http.Request, args map[string]string) (any, error) {
			return s.runAutomationTmuxHistoryCapture(r, args)
		},
	}
}
