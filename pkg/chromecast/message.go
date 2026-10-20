package chromecast

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

// maxMessageSize is the largest message a Cast device sends or accepts.
const maxMessageSize = 64 * 1024

// castMessage is the CastMessage protobuf of the Cast v2 protocol, of which only string payloads are used.
type castMessage struct {
	SourceID      string
	DestinationID string
	Namespace     string
	Payload       string
}

// protobuf field numbers of CastMessage
const (
	fieldProtocolVersion = 1
	fieldSourceID        = 2
	fieldDestinationID   = 3
	fieldNamespace       = 4
	fieldPayloadType     = 5
	fieldPayloadUTF8     = 6
)

const (
	wireVarint  = 0
	wireFixed64 = 1
	wireBytes   = 2
	wireFixed32 = 5
)

func appendTag(b []byte, field int, wire int) []byte {
	return binary.AppendUvarint(b, uint64(field<<3|wire))
}

func appendString(b []byte, field int, s string) []byte {
	b = appendTag(b, field, wireBytes)
	b = binary.AppendUvarint(b, uint64(len(s)))
	return append(b, s...)
}

func (m castMessage) marshal() []byte {
	var b []byte
	// protocol version CASTV2_1_0 and payload type STRING are both 0, but proto2 requires them to be present
	b = appendTag(b, fieldProtocolVersion, wireVarint)
	b = binary.AppendUvarint(b, 0)
	b = appendString(b, fieldSourceID, m.SourceID)
	b = appendString(b, fieldDestinationID, m.DestinationID)
	b = appendString(b, fieldNamespace, m.Namespace)
	b = appendTag(b, fieldPayloadType, wireVarint)
	b = binary.AppendUvarint(b, 0)
	b = appendString(b, fieldPayloadUTF8, m.Payload)
	return b
}

var errMalformed = errors.New("malformed cast message")

func unmarshalMessage(b []byte) (castMessage, error) {
	var m castMessage
	for len(b) > 0 {
		tag, n := binary.Uvarint(b)
		if n <= 0 {
			return m, errMalformed
		}
		b = b[n:]
		field, wire := int(tag>>3), int(tag&7)

		switch wire {
		case wireVarint:
			_, n = binary.Uvarint(b)
			if n <= 0 {
				return m, errMalformed
			}
			b = b[n:]
		case wireFixed64:
			if len(b) < 8 {
				return m, errMalformed
			}
			b = b[8:]
		case wireFixed32:
			if len(b) < 4 {
				return m, errMalformed
			}
			b = b[4:]
		case wireBytes:
			l, n := binary.Uvarint(b)
			if n <= 0 || uint64(len(b)-n) < l {
				return m, errMalformed
			}
			v := string(b[n : n+int(l)])
			b = b[n+int(l):]

			switch field {
			case fieldSourceID:
				m.SourceID = v
			case fieldDestinationID:
				m.DestinationID = v
			case fieldNamespace:
				m.Namespace = v
			case fieldPayloadUTF8:
				m.Payload = v
			}
		default:
			return m, fmt.Errorf("%w: wire type %d", errMalformed, wire)
		}
	}
	return m, nil
}

func writeMessage(w io.Writer, m castMessage) error {
	body := m.marshal()
	if len(body) > maxMessageSize {
		return fmt.Errorf("cast message of %d bytes is too large", len(body))
	}

	buf := make([]byte, 4, 4+len(body))
	binary.BigEndian.PutUint32(buf, uint32(len(body)))
	_, err := w.Write(append(buf, body...))
	return err
}

func readMessage(r io.Reader) (castMessage, error) {
	var size [4]byte
	if _, err := io.ReadFull(r, size[:]); err != nil {
		return castMessage{}, err
	}

	n := binary.BigEndian.Uint32(size[:])
	if n > maxMessageSize {
		return castMessage{}, fmt.Errorf("cast message of %d bytes is too large", n)
	}

	body := make([]byte, n)
	if _, err := io.ReadFull(r, body); err != nil {
		return castMessage{}, err
	}
	return unmarshalMessage(body)
}
