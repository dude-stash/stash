package api

import (
	"context"

	"github.com/stashapp/stash/internal/manager"
)

func (r *subscriptionResolver) FcastSubscribe(ctx context.Context) (<-chan *FCastStatus, error) {
	updates := manager.GetInstance().FCastService.Subscribe(ctx)
	ret := make(chan *FCastStatus, 16)

	go func() {
		defer close(ret)
		for s := range updates {
			select {
			case ret <- fcastStatusToModel(s):
			case <-ctx.Done():
				return
			}
		}
	}()

	return ret, nil
}
