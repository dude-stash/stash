package scraper

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/stashapp/stash/pkg/models"
)

// unresolvedPlaceholderRegexp matches any {name} placeholder left over after
// substitution, indicating the query url references a value that wasn't
// available (e.g. {url} when the scraped object has no saved URL).
var unresolvedPlaceholderRegexp = regexp.MustCompile(`{[a-zA-Z0-9_]+}`)

type queryURLReplacements map[string]mappedRegexConfigs

type queryURLParameters map[string]string

func queryURLParametersFromScene(scene *models.Scene) queryURLParameters {
	ret := make(queryURLParameters)
	ret["checksum"] = scene.Checksum
	ret["oshash"] = scene.OSHash
	ret["filename"] = filepath.Base(scene.Path)

	// pull phash from primary file
	phashFingerprints := scene.Files.Primary().Base().Fingerprints.Filter(models.FingerprintTypePhash)
	if len(phashFingerprints) > 0 {
		ret["phash"] = phashFingerprints[0].Value()
	}

	if scene.Title != "" {
		ret["title"] = scene.Title
	}
	if len(scene.URLs.List()) > 0 {
		ret["url"] = scene.URLs.List()[0]
	}
	return ret
}

func queryURLParametersFromScrapedScene(scene models.ScrapedSceneInput) queryURLParameters {
	ret := make(queryURLParameters)

	setField := func(field string, value *string) {
		if value != nil {
			ret[field] = *value
		}
	}

	setField("title", scene.Title)
	setField("code", scene.Code)
	if len(scene.URLs) > 0 {
		setField("url", &scene.URLs[0])
	} else {
		setField("url", scene.URL)
	}
	setField("date", scene.Date)
	setField("production_date", scene.ProductionDate)
	setField("details", scene.Details)
	setField("director", scene.Director)
	setField("remote_site_id", scene.RemoteSiteID)
	return ret
}

func queryURLParameterFromURL(url string) queryURLParameters {
	ret := make(queryURLParameters)
	ret["url"] = url
	return ret
}

func queryURLParametersFromGallery(gallery *models.Gallery) queryURLParameters {
	ret := make(queryURLParameters)
	ret["checksum"] = gallery.PrimaryChecksum()

	if gallery.Path != "" {
		ret["filename"] = filepath.Base(gallery.Path)
	}
	if gallery.Title != "" {
		ret["title"] = gallery.Title
	}

	if len(gallery.URLs.List()) > 0 {
		ret["url"] = gallery.URLs.List()[0]
	}

	return ret
}

func queryURLParametersFromImage(image *models.Image) queryURLParameters {
	ret := make(queryURLParameters)
	ret["checksum"] = image.Checksum

	if image.Path != "" {
		ret["filename"] = filepath.Base(image.Path)
	}
	if image.Title != "" {
		ret["title"] = image.Title
	}

	if len(image.URLs.List()) > 0 {
		ret["url"] = image.URLs.List()[0]
	}

	return ret
}

func (p queryURLParameters) applyReplacements(r queryURLReplacements) {
	for k, v := range p {
		rpl, found := r[k]
		if found {
			p[k] = rpl.apply(v)
		}
	}
}

func (p queryURLParameters) constructURL(url string) (string, error) {
	ret := url
	for k, v := range p {
		ret = strings.ReplaceAll(ret, "{"+k+"}", v)
	}

	if m := unresolvedPlaceholderRegexp.FindString(ret); m != "" {
		return "", fmt.Errorf("scraper query url %q contains unresolved placeholder %q - the scraped object may be missing the required field", url, m)
	}

	return ret, nil
}

// replaceURL does a partial URL Replace ( only url parameter is used)
func replaceURL(url string, scraperConfig ByURLDefinition) string {
	u := url
	queryURL := queryURLParameterFromURL(u)
	if scraperConfig.QueryURLReplacements != nil {
		queryURL.applyReplacements(scraperConfig.QueryURLReplacements)
		// queryURL always has the "url" key set above, so this cannot fail
		u, _ = queryURL.constructURL(scraperConfig.QueryURL)
	}
	return u
}
