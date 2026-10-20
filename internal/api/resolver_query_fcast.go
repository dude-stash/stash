package api

import (
	"context"
	"strconv"

	"github.com/stashapp/stash/internal/fcast"
	"github.com/stashapp/stash/internal/manager"
	fcastproto "github.com/stashapp/stash/pkg/fcast"
)

func (r *queryResolver) FcastReceivers(ctx context.Context) ([]*FCastReceiver, error) {
	receivers, err := manager.GetInstance().FCastService.Discover(ctx)
	if err != nil {
		return nil, err
	}

	ret := make([]*FCastReceiver, len(receivers))
	for i, receiver := range receivers {
		ret[i] = &FCastReceiver{
			Name:    receiver.Name,
			Address: receiver.Address,
		}
	}
	return ret, nil
}

func (r *queryResolver) FcastSessions(ctx context.Context) ([]*FCastStatus, error) {
	sessions := manager.GetInstance().FCastService.Sessions()

	ret := make([]*FCastStatus, len(sessions))
	for i, s := range sessions {
		ret[i] = fcastStatusToModel(s)
	}
	return ret, nil
}

func fcastStatusToModel(s fcast.Status) *FCastStatus {
	ret := &FCastStatus{
		Address:   s.Address,
		Name:      s.Name,
		Connected: s.Connected,
		State:     FCastPlaybackStateIdle,
		Time:      s.Time,
		Duration:  s.Duration,
		Volume:    s.Volume,
	}

	if ret.Name == "" {
		ret.Name = s.Address
	}

	switch s.State {
	case fcastproto.StatePlaying:
		ret.State = FCastPlaybackStatePlaying
	case fcastproto.StatePaused:
		ret.State = FCastPlaybackStatePaused
	}

	if s.SceneID != 0 {
		id := strconv.Itoa(s.SceneID)
		ret.SceneID = &id
	}
	if s.Error != "" {
		ret.Error = &s.Error
	}

	return ret
}
