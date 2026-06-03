package api

import (
	"fmt"
	"regexp"
	"strings"
)

type CommandPolicyMode string

const (
	CommandPolicyAudit   CommandPolicyMode = "audit"
	CommandPolicyEnforce CommandPolicyMode = "enforce"
)

type CommandPolicyConfig struct {
	Mode         CommandPolicyMode
	DenyPatterns []string
}

type commandPolicy struct {
	mode  CommandPolicyMode
	rules []commandPolicyRule
}

type commandPolicyRule struct {
	pattern string
	regex   *regexp.Regexp
}

type commandPolicyDecision struct {
	Allowed bool
	Pattern string
}

func NewCommandPolicy(config CommandPolicyConfig) (commandPolicy, error) {
	mode, err := normalizeCommandPolicyMode(config.Mode)
	if err != nil {
		return commandPolicy{}, err
	}
	rules := make([]commandPolicyRule, 0, len(config.DenyPatterns))
	for _, pattern := range config.DenyPatterns {
		rule, err := newCommandPolicyRule(pattern)
		if err != nil {
			return commandPolicy{}, err
		}
		rules = append(rules, rule)
	}
	return commandPolicy{mode: mode, rules: rules}, nil
}

func mustCommandPolicy(config CommandPolicyConfig) commandPolicy {
	policy, err := NewCommandPolicy(config)
	if err != nil {
		panic(err)
	}
	return policy
}

func (p commandPolicy) Evaluate(input string) commandPolicyDecision {
	command := normalizeCommandInput(input)
	for _, rule := range p.rules {
		if rule.regex.MatchString(command) {
			return commandPolicyDecision{Allowed: p.mode != CommandPolicyEnforce, Pattern: rule.pattern}
		}
	}
	return commandPolicyDecision{Allowed: true}
}

func newCommandPolicyRule(pattern string) (commandPolicyRule, error) {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" {
		return commandPolicyRule{}, fmt.Errorf("command policy pattern is required")
	}
	regex, err := regexp.Compile(pattern)
	if err != nil {
		return commandPolicyRule{}, fmt.Errorf("compile command policy pattern %q: %w", pattern, err)
	}
	return commandPolicyRule{pattern: pattern, regex: regex}, nil
}

func normalizeCommandPolicyMode(mode CommandPolicyMode) (CommandPolicyMode, error) {
	if mode == CommandPolicyAudit || mode == CommandPolicyEnforce {
		return mode, nil
	}
	if mode == "" {
		return CommandPolicyEnforce, nil
	}
	return "", fmt.Errorf("invalid command policy mode: %s", mode)
}

func normalizeCommandInput(input string) string {
	input = strings.ReplaceAll(input, "\x1b[200~", "")
	input = strings.ReplaceAll(input, "\x1b[201~", "")
	return strings.TrimSpace(input)
}
