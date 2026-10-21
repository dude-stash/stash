package api

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/stashapp/stash/internal/manager/config"
	"github.com/stashapp/stash/pkg/logger"
)

// castMediaServer serves scene media over plain HTTP to Cast devices, which don't accept Stash's own certificate. It is only used when Stash is served over HTTPS.
type castMediaServer struct {
	host string
	// port is the configured port, or 0 to pick one on first use
	port        int
	defaultPort int
	handler     http.Handler

	mu     sync.Mutex
	server *http.Server
	addr   *net.TCPAddr
}

func newCastMediaServer(host string, port int, defaultPort int, handler http.Handler) *castMediaServer {
	return &castMediaServer{
		host:        host,
		port:        port,
		defaultPort: defaultPort,
		handler:     handler,
	}
}

// castMediaRoutes has the same authentication as the main server, which accepts signed URLs, but only the scene routes, as Cast devices need nothing else.
func castMediaRoutes(sceneRoutes http.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(cors.AllowAll().Handler)
	r.Use(RequestIPMiddleware)
	r.Use(signedOnly)
	r.Use(authenticateHandler())
	r.Use(middleware.Recoverer)
	r.Mount("/scene", sceneRoutes)
	return r
}

// signedOnly refuses requests without a signed URL when a login is set up, as Cast devices only use those, and session cookies or API keys sent here would cross the network unencrypted.
func signedOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if config.GetInstance().HasCredentials() {
			if _, ok := authenticateSignedRequest(r); !ok {
				http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// Port starts the server if it isn't running, and returns the port it listens on.
func (s *castMediaServer) Port() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.addr != nil {
		return s.addr.Port, nil
	}

	port := s.port
	if port == 0 {
		port = s.defaultPort
	}
	ln, err := net.Listen("tcp", net.JoinHostPort(s.host, strconv.Itoa(port)))
	if err != nil && s.port == 0 {
		// the default port is taken, so any free one will do
		ln, err = net.Listen("tcp", net.JoinHostPort(s.host, "0"))
	}
	if err != nil {
		return 0, fmt.Errorf("opening a port for Cast devices to load media from: %w", err)
	}

	s.addr = ln.Addr().(*net.TCPAddr)
	s.server = &http.Server{Handler: s.handler}
	logger.Infof("stash is serving media to Cast devices over http on port %d", s.addr.Port)

	server := s.server
	go func() {
		if err := server.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
			logger.Errorf("Cast devices can't load media from stash: %v", err)
		}
	}()

	return s.addr.Port, nil
}

func (s *castMediaServer) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server == nil {
		return nil
	}
	return s.server.Shutdown(ctx)
}
