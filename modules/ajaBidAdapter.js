import { Renderer } from 'src/Renderer';
import * as utils from 'src/utils';
import { registerBidder } from 'src/adapters/bidderFactory';
import { VIDEO, BANNER } from 'src/mediaTypes';

const BIDDER_CODE = 'aja';
const URL = '//ad.as.amanad.adtdp.com/v1/prebid';
const SDK_TYPE = 5;
const AD_TYPE = {
  BANNER: 1,
  NATIVE: 2,
  VIDEO: 3,
};

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [VIDEO, BANNER],

  isBidRequestValid: function(bid) {
    return !!(bid.params.asi);
  },

  buildRequests: function(validBidRequests, bidderRequest) {
    var bidRequests = [];
    for (var i = 0, len = validBidRequests.length; i < len; i++) {
      var bid = validBidRequests[i];
      var queryString = '';
      const asi = utils.getBidIdParameter('asi', bid.params);
      queryString = utils.tryAppendQueryString(queryString, 'asi', asi);
      queryString = utils.tryAppendQueryString(queryString, 'skt', SDK_TYPE);
      queryString = utils.tryAppendQueryString(queryString, 'prebid_id', bid.bidId);
      queryString = utils.tryAppendQueryString(queryString, 'prebid_ver', '$prebid.version$');

      bidRequests.push({
        method: 'GET',
        url: URL,
        data: queryString
      });
    }

    return bidRequests;
  },

  interpretResponse: function(bidderResponse, request) {
    const bidderResponseBody = bidderResponse.body;

    if (!bidderResponseBody.is_ad_return) {
      return [];
    }

    const ad = bidderResponseBody.ad;

    const bid = {
      requestId: ad.prebid_id,
      cpm: ad.price,
      creativeId: ad.creative_id,
      dealId: ad.deal_id,
      currency: ad.currency || 'JPY',
      netRevenue: true,
      ttl: 300, // 5 minutes
    }

    if (AD_TYPE.VIDEO === ad.ad_type) {
      const videoAd = bidderResponseBody.ad.video;
      Object.assign(bid, {
        vastXml: videoAd.vtag,
        width: videoAd.w,
        height: videoAd.h,
        renderer: newRenderer(bidderResponseBody),
        adResponse: bidderResponseBody,
        mediaType: VIDEO
      });
    } else if (AD_TYPE.BANNER === ad.ad_type) {
      const bannerAd = bidderResponseBody.ad.banner;
      Object.assign(bid, {
        width: bannerAd.w,
        height: bannerAd.h,
        ad: bannerAd.tag,
        mediaType: BANNER
      });
      try {
        const url = bannerAd.imps[0];
        const tracker = utils.createTrackPixelHtml(url);
        bid.ad += tracker;
      } catch (error) {
        utils.logError('Error appending tracking pixel', error);
      }
    }

    return [bid];
  },

  getUserSyncs: function(syncOptions, serverResponses) {
    const syncs = [];
    if (syncOptions.pixelEnabled) {
      const bidderResponseBody = serverResponses[0].body;
      if (bidderResponseBody.syncs) {
        bidderResponseBody.syncs.forEach(sync => {
          syncs.push({
            type: 'image',
            url: sync
          });
        });
      }
    }

    return syncs;
  },
}

function newRenderer(bidderResponse) {
  const renderer = Renderer.install({
    id: bidderResponse.ad.prebid_id,
    url: bidderResponse.ad.video.purl,
    loaded: false,
  });

  try {
    renderer.setRender(outstreamRender);
  } catch (err) {
    utils.logWarn('Prebid Error calling setRender on newRenderer', err)
  }

  return renderer;
}

function outstreamRender(bid) {
  bid.renderer.push(() => {
    window.aja_vast_player.init({
      vast_tag: bid.adResponse.ad.video.vtag,
      ad_unit_code: bid.adUnitCode, // target div id to render video
      progress: bid.adResponse.ad.video.progress,
      loop: bid.adResponse.ad.video.loop,
      inread: bid.adResponse.ad.video.inread
    });
  });
}

registerBidder(spec);
