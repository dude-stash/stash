package api

import (
	"context"
	"strconv"

	"github.com/stashapp/stash/internal/chromecast"
	"github.com/stashapp/stash/internal/manager"
)

func (r *queryResolver) ChromecastDevices(ctx context.Context) ([]*ChromecastDevice, error) {
	devices, err := manager.GetInstance().ChromecastService.Discover(ctx)
	if err != nil {
		return nil, err
	}

	ret := make([]*ChromecastDevice, len(devices))
	for i, d := range devices {
		ret[i] = &ChromecastDevice{
			Name:    d.Name,
			Address: d.Address,
		}
		if d.Model != "" {
			ret[i].Model = &devices[i].Model
		}
	}
	return ret, nil
}

func (r *queryResolver) ChromecastSessions(ctx context.Context) ([]*ChromecastStatus, error) {
	sessions := manager.GetInstance().ChromecastService.Sessions()

	ret := make([]*ChromecastStatus, len(sessions))
	for i, s := range sessions {
		ret[i] = chromecastStatusToModel(s)
	}
	return ret, nil
}

func chromecastStatusToModel(s chromecast.Status) *ChromecastStatus {
	ret := &ChromecastStatus{
		Address:   s.Address,
		Name:      s.Name,
		Connected: s.Connected,
		State:     ChromecastPlaybackState(s.State),
		Time:      s.Time,
		Duration:  s.Duration,
		Volume:    s.Volume,
		Muted:     s.Muted,
	}

	if !ret.State.IsValid() {
		ret.State = ChromecastPlaybackStateIdle
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
