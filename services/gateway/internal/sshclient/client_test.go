package sshclient

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/pem"
	"testing"

	"golang.org/x/crypto/ssh"
)

func TestAuthMethodForPrivateKeyCredential(t *testing.T) {
	key := testPrivateKeyPEM(t)
	auth, err := authMethodForCredential(Credential{
		Kind: CredentialKindPrivateKey, PrivateKey: key,
	})
	if err != nil {
		t.Fatalf("authMethodForCredential failed: %v", err)
	}
	if auth == nil {
		t.Fatal("expected private key auth method")
	}
}

func TestAuthMethodForEncryptedPrivateKeyCredential(t *testing.T) {
	key := testEncryptedPrivateKeyPEM(t, "passphrase")
	auth, err := authMethodForCredential(Credential{
		Kind: CredentialKindPrivateKey, PrivateKey: key, Passphrase: "passphrase",
	})
	if err != nil {
		t.Fatalf("authMethodForCredential failed: %v", err)
	}
	if auth == nil {
		t.Fatal("expected encrypted private key auth method")
	}
}

func testPrivateKeyPEM(t *testing.T) string {
	t.Helper()
	key := testECDSAPrivateKey(t)
	block, err := ssh.MarshalPrivateKey(key, "chatmux-test")
	if err != nil {
		t.Fatalf("MarshalPrivateKey failed: %v", err)
	}
	return string(pem.EncodeToMemory(block))
}

func testEncryptedPrivateKeyPEM(t *testing.T, passphrase string) string {
	t.Helper()
	key := testECDSAPrivateKey(t)
	block, err := ssh.MarshalPrivateKeyWithPassphrase(key, "chatmux-test", []byte(passphrase))
	if err != nil {
		t.Fatalf("MarshalPrivateKeyWithPassphrase failed: %v", err)
	}
	return string(pem.EncodeToMemory(block))
}

func testECDSAPrivateKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey failed: %v", err)
	}
	return key
}
