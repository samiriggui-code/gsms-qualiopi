package file

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Tencent/WeKnora/internal/utils"
)

// The object storage clients must not carry Go's whole-request timeout: it
// bounds the body transfer too, so it capped every upload and download at
// what a link can move in 30 seconds (#3306).
func TestObjectStorageHTTPClientConfigDropsOnlyTheWholeRequestTimeout(t *testing.T) {
	want := utils.DefaultSSRFSafeHTTPClientConfig()
	want.Timeout = 0

	require.Equal(t, want, objectStorageHTTPClientConfig())
}

// Without the whole-request timeout, connection setup is bounded on the
// transport instead; a silent peer must still fail in bounded time.
func TestObjectStorageTransportBoundsConnectionSetup(t *testing.T) {
	transport := objectStorageTransport()

	require.Equal(t, 10*time.Second, transport.TLSHandshakeTimeout)
	require.Equal(t, objectStorageResponseHeaderTimeout, transport.ResponseHeaderTimeout)
	require.Equal(t, time.Second, transport.ExpectContinueTimeout)
	require.Equal(t, 90*time.Second, transport.IdleConnTimeout)
	require.NotNil(t, transport.DialContext, "the SSRF-safe dialer must stay in place")
}

func TestObjectStorageHTTPClientKeepsTheSSRFGuard(t *testing.T) {
	client := objectStorageHTTPClient()

	require.Zero(t, client.Timeout)
	_, ok := client.Transport.(*utils.SSRFValidatingRoundTripper)
	require.True(t, ok)
	require.NotNil(t, client.CheckRedirect)
}

func TestS3ClientHasNoWholeRequestTimeout(t *testing.T) {
	svc, err := newS3Client("", "ak", "sk", "bucket", "us-east-1", "", false)
	require.NoError(t, err)

	client, ok := svc.client.Options().HTTPClient.(*http.Client)
	require.True(t, ok)
	require.Zero(t, client.Timeout)
}

func TestObjectStorageTransferContextAddsFallbackDeadline(t *testing.T) {
	ctx, cancel := objectStorageTransferContext(context.Background())
	defer cancel()

	deadline, ok := ctx.Deadline()
	require.True(t, ok)
	remain := time.Until(deadline)
	require.Greater(t, remain, 29*time.Minute)
	require.Less(t, remain, 31*time.Minute)
}

func TestObjectStorageTransferContextKeepsCallerDeadline(t *testing.T) {
	parent, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ctx, stop := objectStorageTransferContext(parent)
	defer stop()
	require.Equal(t, parent, ctx)
}

func TestObjectStorageBoundReaderCancelsOnClose(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	body := objectStorageBoundReader(io.NopCloser(strings.NewReader("x")), cancel)
	require.NoError(t, body.Close())
	require.ErrorIs(t, ctx.Err(), context.Canceled)
}

