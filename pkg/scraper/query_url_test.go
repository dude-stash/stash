package scraper

import "testing"

func TestConstructURL(t *testing.T) {
	tests := []struct {
		name    string
		params  queryURLParameters
		url     string
		want    string
		wantErr bool
	}{
		{
			name:   "substitutes known placeholders",
			params: queryURLParameters{"url": "https://example.com/scene/1"},
			url:    "https://scraper.example/lookup?url={url}",
			want:   "https://scraper.example/lookup?url=https://example.com/scene/1",
		},
		{
			name:    "errors on unresolved placeholder",
			params:  queryURLParameters{},
			url:     "https://scraper.example/lookup?url={url}",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.params.constructURL(tt.url)
			if (err != nil) != tt.wantErr {
				t.Errorf("constructURL() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.want {
				t.Errorf("constructURL() = %v, want %v", got, tt.want)
			}
		})
	}
}
