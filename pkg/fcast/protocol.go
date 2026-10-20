// Package fcast implements a sender for version 3 of the FCast casting protocol: https://docs.fcast.org/protocol/v3/
package fcast

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const (
	DefaultPort = 46899

	protocolVersion = 3
	headerSize      = 5
	maxPacketSize   = 32000
)

type Opcode uint8

const (
	OpNone Opcode = iota
	OpPlay
	OpPause
	OpResume
	OpStop
	OpSeek
	OpPlaybackUpdate
	OpVolumeUpdate
	OpSetVolume
	OpPlaybackError
	OpSetSpeed
	OpVersion
	OpPing
	OpPong
	OpInitial
	OpPlayUpdate
)

type PlaybackState int

const (
	StateIdle PlaybackState = iota
	StatePlaying
	StatePaused
)

const metadataTypeGeneric = 0

type Metadata struct {
	Title        string `json:"title,omitempty"`
	ThumbnailURL string `json:"thumbnailUrl,omitempty"`
}

func (m Metadata) MarshalJSON() ([]byte, error) {
	type metadata Metadata
	return json.Marshal(struct {
		Type int `json:"type"`
		metadata
	}{metadataTypeGeneric, metadata(m)})
}

type PlayMessage struct {
	// Container is the MIME type of the media, e.g. video/mp4.
	Container string            `json:"container"`
	URL       string            `json:"url,omitempty"`
	Time      float64           `json:"time,omitempty"`
	Speed     float64           `json:"speed,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
	Metadata  *Metadata         `json:"metadata,omitempty"`
}

// PlaybackUpdateMessage reports the receiver's playback state. Time, Duration and Speed are absent when idle.
type PlaybackUpdateMessage struct {
	GenerationTime int64         `json:"generationTime"`
	State          PlaybackState `json:"state"`
	Time           *float64      `json:"time"`
	Duration       *float64      `json:"duration"`
	Speed          *float64      `json:"speed"`
}

type VolumeUpdateMessage struct {
	GenerationTime int64   `json:"generationTime"`
	Volume         float64 `json:"volume"`
}

type PlaybackErrorMessage struct {
	Message string `json:"message"`
}

type VersionMessage struct {
	Version int `json:"version"`
}

// InitialMessage introduces each side after the version handshake. Only receivers send PlayData.
type InitialMessage struct {
	DisplayName string       `json:"displayName,omitempty"`
	AppName     string       `json:"appName,omitempty"`
	AppVersion  string       `json:"appVersion,omitempty"`
	PlayData    *PlayMessage `json:"playData,omitempty"`
}

// PlayUpdateMessage is sent to every sender when any sender starts new media.
type PlayUpdateMessage struct {
	GenerationTime int64        `json:"generationTime"`
	PlayData       *PlayMessage `json:"playData"`
}

type seekMessage struct {
	Time float64 `json:"time"`
}

type setVolumeMessage struct {
	Volume float64 `json:"volume"`
}

type setSpeedMessage struct {
	Speed float64 `json:"speed"`
}

var ErrPacketTooLarge = errors.New("fcast packet too large")

func writePacket(w io.Writer, op Opcode, body interface{}) error {
	var data []byte
	if body != nil {
		var err error
		data, err = json.Marshal(body)
		if err != nil {
			return err
		}
	}

	if headerSize+len(data) > maxPacketSize {
		return ErrPacketTooLarge
	}

	buf := make([]byte, headerSize+len(data))
	binary.LittleEndian.PutUint32(buf, uint32(len(data)+1))
	buf[4] = byte(op)
	copy(buf[headerSize:], data)

	_, err := w.Write(buf)
	return err
}

func readPacket(r io.Reader) (Opcode, []byte, error) {
	var header [headerSize]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return OpNone, nil, err
	}

	// the size counts the opcode byte as well as the body
	size := binary.LittleEndian.Uint32(header[:4])
	if size == 0 {
		return OpNone, nil, fmt.Errorf("invalid fcast packet size 0")
	}
	if size > maxPacketSize {
		return OpNone, nil, ErrPacketTooLarge
	}

	body := make([]byte, size-1)
	if _, err := io.ReadFull(r, body); err != nil {
		return OpNone, nil, err
	}

	return Opcode(header[4]), body, nil
}

func decodeMessage(op Opcode, body []byte) (interface{}, error) {
	var msg interface{}
	switch op {
	case OpPlaybackUpdate:
		msg = &PlaybackUpdateMessage{}
	case OpVolumeUpdate:
		msg = &VolumeUpdateMessage{}
	case OpPlaybackError:
		msg = &PlaybackErrorMessage{}
	case OpVersion:
		msg = &VersionMessage{}
	case OpInitial:
		msg = &InitialMessage{}
	case OpPlayUpdate:
		msg = &PlayUpdateMessage{}
	default:
		return nil, nil
	}

	if err := json.Unmarshal(body, msg); err != nil {
		return nil, fmt.Errorf("decoding fcast message %d: %w", op, err)
	}
	return msg, nil
}
