package tmux

import "testing"

func TestParseSessions(t *testing.T) {
	output := "$0\tdeploy\t2\t1\t1710000000\n$1\tlogs\t1\t0\t1710000300\n"
	sessions, err := ParseSessions(output)
	if err != nil {
		t.Fatalf("ParseSessions failed: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(sessions))
	}
	if sessions[0].Name != "deploy" {
		t.Fatalf("expected deploy, got %q", sessions[0].Name)
	}
	if !sessions[0].Attached {
		t.Fatal("expected first session to be attached")
	}
	if sessions[1].Windows != 1 {
		t.Fatalf("expected one window, got %d", sessions[1].Windows)
	}
}

func TestParseSessionsRejectsBadLine(t *testing.T) {
	_, err := ParseSessions("bad line")
	if err == nil {
		t.Fatal("expected parse error")
	}
}
