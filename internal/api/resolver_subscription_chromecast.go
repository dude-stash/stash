package api

import (
	"context"

	"github.com/stashapp/stash/internal/manager"
)

func (r *subscriptionResolver) ChromecastSubscribe(ctx context.Context) (<-chan *ChromecastStatus, error) {
	updates := manager.GetInstance().ChromecastService.Subscribe(ctx)
	ret := make(chan *ChromecastStatus, 16)

	go func() {
		defer close(ret)
		for s := range updates {
			select {
			case ret <- chromecastStatusToModel(s):
			case <-ctx.Done():
				return
			}
		}
	}()

	return ret, nil
}
