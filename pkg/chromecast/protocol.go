package chromecast

import (
	"encoding/json"
)

const (
	DefaultPort = 8009
	// DefaultMediaReceiver is the app ID of Google's receiver that plays media URLs.
	DefaultMediaReceiver = "CC1AD845"

	senderID   = "sender-0"
	receiverID = "receiver-0"

	nsConnection = "urn:x-cast:com.google.cast.tp.connection"
	nsHeartbeat  = "urn:x-cast:com.google.cast.tp.heartbeat"
	nsReceiver   = "urn:x-cast:com.google.cast.receiver"
	nsMedia      = "urn:x-cast:com.google.cast.media"
)

type PlayerState string

const (
	PlayerIdle      PlayerState = "IDLE"
	PlayerBuffering PlayerState = "BUFFERING"
	PlayerLoading   PlayerState = "LOADING"
	PlayerPlaying   PlayerState = "PLAYING"
	PlayerPaused    PlayerState = "PAUSED"
)

type IdleReason string

const (
	IdleCancelled   IdleReason = "CANCELLED"
	IdleInterrupted IdleReason = "INTERRUPTED"
	IdleFinished    IdleReason = "FINISHED"
	IdleError       IdleReason = "ERROR"
)

type header struct {
	Type      string `json:"type"`
	RequestID int    `json:"requestId,omitempty"`
}

type Volume struct {
	Level *float64 `json:"level,omitempty"`
	Muted *bool    `json:"muted,omitempty"`
}

type Application struct {
	AppID        string `json:"appId"`
	DisplayName  string `json:"displayName"`
	IsIdleScreen bool   `json:"isIdleScreen"`
	SessionID    string `json:"sessionId"`
	TransportID  string `json:"transportId"`
}

// ReceiverStatus is the state of the device: the app it is running, and its volume.
type ReceiverStatus struct {
	Applications []Application `json:"applications"`
	Volume       Volume        `json:"volume"`
}

func (s *ReceiverStatus) App(appID string) *Application {
	for i := range s.Applications {
		if s.Applications[i].AppID == appID {
			return &s.Applications[i]
		}
	}
	return nil
}

type Image struct {
	URL string `json:"url"`
}

type Metadata struct {
	// 0 is generic media
	MetadataType int     `json:"metadataType"`
	Title        string  `json:"title,omitempty"`
	Images       []Image `json:"images,omitempty"`
}

type MediaInfo struct {
	ContentID   string    `json:"contentId"`
	ContentType string    `json:"contentType"`
	StreamType  string    `json:"streamType"`
	Duration    float64   `json:"duration,omitempty"`
	Metadata    *Metadata `json:"metadata,omitempty"`
	// HLS segment formats, needed for MPEG-TS segments
	HLSSegmentFormat      string `json:"hlsSegmentFormat,omitempty"`
	HLSVideoSegmentFormat string `json:"hlsVideoSegmentFormat,omitempty"`
}

// LoadRequest asks the Default Media Receiver to play a URL.
type LoadRequest struct {
	Media       MediaInfo `json:"media"`
	CurrentTime float64   `json:"currentTime"`
	Autoplay    bool      `json:"autoplay"`
}

type MediaStatus struct {
	MediaSessionID int         `json:"mediaSessionId"`
	PlayerState    PlayerState `json:"playerState"`
	IdleReason     IdleReason  `json:"idleReason,omitempty"`
	CurrentTime    float64     `json:"currentTime"`
	// only sent when the media changes
	Media *MediaInfo `json:"media,omitempty"`
}

// MediaStatusMessage reports the media sessions of the app that sent it.
type MediaStatusMessage struct {
	Source string
	Status []MediaStatus
}

// ErrorMessage is a request the device or app refused, such as a LOAD of a URL it can't play.
type ErrorMessage struct {
	Type      string `json:"type"`
	RequestID int    `json:"requestId"`
	Reason    string `json:"reason,omitempty"`
	// DetailedErrorCode is set by some receivers on LOAD_FAILED.
	DetailedErrorCode int `json:"detailedErrorCode,omitempty"`
}

// CloseMessage means the device closed the virtual connection to Source, such as when the app stopped.
type CloseMessage struct {
	Source string
}

type receiverStatusMessage struct {
	Status ReceiverStatus `json:"status"`
}

type mediaStatusMessage struct {
	Status []MediaStatus `json:"status"`
}

type launchRequest struct {
	header
	AppID string `json:"appId"`
}

type stopAppRequest struct {
	header
	SessionID string `json:"sessionId"`
}

type setVolumeRequest struct {
	header
	Volume Volume `json:"volume"`
}

type loadRequest struct {
	header
	LoadRequest
}

type mediaRequest struct {
	header
	MediaSessionID int      `json:"mediaSessionId"`
	CurrentTime    *float64 `json:"currentTime,omitempty"`
}

// decodeMessage returns nil for messages that Stash has no use for.
func decodeMessage(m castMessage) (interface{}, error) {
	var h header
	if err := json.Unmarshal([]byte(m.Payload), &h); err != nil {
		return nil, err
	}

	switch m.Namespace {
	case nsConnection:
		if h.Type == "CLOSE" {
			return &CloseMessage{Source: m.SourceID}, nil
		}
	case nsReceiver:
		switch h.Type {
		case "RECEIVER_STATUS":
			var msg receiverStatusMessage
			if err := json.Unmarshal([]byte(m.Payload), &msg); err != nil {
				return nil, err
			}
			return &msg.Status, nil
		case "LAUNCH_ERROR", "INVALID_REQUEST":
			return decodeError(m.Payload)
		}
	case nsMedia:
		switch h.Type {
		case "MEDIA_STATUS":
			var msg mediaStatusMessage
			if err := json.Unmarshal([]byte(m.Payload), &msg); err != nil {
				return nil, err
			}
			return &MediaStatusMessage{Source: m.SourceID, Status: msg.Status}, nil
		case "LOAD_FAILED", "LOAD_CANCELLED", "INVALID_REQUEST", "INVALID_PLAYER_STATE", "ERROR":
			return decodeError(m.Payload)
		}
	}
	return nil, nil
}

func decodeError(payload string) (*ErrorMessage, error) {
	var msg ErrorMessage
	if err := json.Unmarshal([]byte(payload), &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}
