require('dotenv').config();

const { App } = require('@slack/bolt');
const Fuse = require('fuse.js');
const ms = require('pretty-ms');
const Spotify = require('node-spotify-api');
const { YouTube } = require('better-youtube-api');

// Initialize slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Initialize spotify api
const spotify = new Spotify({
  id: process.env.SPOTIFY_CLIENT_ID,
  secret: process.env.SPOTIFY_CLIENT_SECRET,
});

const youtube = new YouTube(process.env.YOUTUBE_API_KEY);

const SEARCH_LIMIT = 5;

/* Helper Functions
 * (will eventually be moved into separate files)
 */

/*
 * Spotify Data Parsing Helper
 */

const formatSpotifySearchResults = (data, searchString = null) => {
  /* Data we need from spotify
   * tracks {
   *  href -> the uri of the search query itself,
   *  items -> array of items,
   *  total -> total number of results,
   *  next -> url for the next set of search results (if over 20),
   *  previous -> url for the previous set of search results
   * }
   *
   * what does an item look like?
   *
   */

  if (!data && !data.tracks) {
    throw new Error(
      'Data not in correct form: Expecting an object with a tracks attribute.'
    );
  }

  const {
    tracks: { total, items, next, previous },
  } = data;
  const searchResults = [];

  if (searchString) {
    searchResults.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Search for "${searchString}" returned *${total}* results:`,
      },
    });
  }

  items.forEach(result => {
    const {
      album,
      artists,
      duration_ms,
      explicit,
      external_urls,
      name,
      id,
      popularity,
    } = result;

    console.log(duration_ms);
    searchResults.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `
            *<${external_urls.spotify}|${name}>*\n
            <${album.external_urls.spotify}|${album.name}>\n
            _<${artists[0].external_urls.spotify}|${artists[0].name}>_`,
        },
        accessory: {
          type: 'image',
          image_url: album.images[1].url,
          alt_text: `${artists[0].name} ${album.name} thumbnail`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'plain_text',
            emoji: true,
            text: ms(duration_ms, { secondsDecimalDigits: 0 }),
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Select',
              emoji: true,
            },
            style: 'primary',
            value: external_urls.spotify,
            action_id: 'song_select_button',
          },
        ],
      }
    );
  });

  const paginationActions = [];

  if (previous) {
    paginationActions.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: `< Previous ${SEARCH_LIMIT}`,
        emoji: true,
      },
      style: 'primary',
      value: previous,
      action_id: 'previous_results',
    });
  }

  if (next) {
    paginationActions.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: `Next ${SEARCH_LIMIT} >`,
        emoji: true,
      },
      style: 'primary',
      value: next,
      action_id: 'next_results',
    });
  }

  const paginationNav = {
    type: 'actions',
    elements: paginationActions,
  };

  if (paginationActions.length) {
    searchResults.push({ type: 'divider' }, paginationNav);
  }

  return searchResults;
};

const extractSpotifyTrackInformation = ({ artists, album, name }) => {
  return {
    artist: artists[0].name,
    album: album.name,
    track: name,
  };
};

const spotifyUrlComponents = url => {
  const components = url
    .replace(/https?:\/\//g, '')
    .replace('<', '')
    .replace('>', '')
    .split('/');

  return {
    domain: components[0],
    idType: components[1],
    spotifyId: components[2],
  };
};

const postResults = (respond, blocks) => {
  respond({
    response_type: 'ephemeral',
    blocks,
    replace_original: true,
    delete_original: true,
  });
};

app.message('hello', ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  say(`Hey there <@${message.user}>!`);
});

app.message(/open\.spotify\.com/g, async ({ message, say }) => {
  const fuzzySearchOptions = {
    keys: [
      { name: 'title', weight: 0.8 },
      { name: 'description', weight: 0.2 },
    ],
    id: 'shortUrl',
  };
  const linkComponents = spotifyUrlComponents(message.text);
  const response = await spotify.request(
    `https://api.spotify.com/v1/${linkComponents.idType}s/${linkComponents.spotifyId}`
  );
  const trackInfo = extractSpotifyTrackInformation(response);
  const searchString = `${trackInfo.track} ${trackInfo.artist} ${trackInfo.album}`;
  console.log(searchString);
  const youtubeResult = await youtube.searchVideos(searchString, 10);
  const fuse = new Fuse(youtubeResult, fuzzySearchOptions);
  const bestMatches = fuse.search(searchString);
  console.log(bestMatches);

  say(
    `Nice! <@${message.user}> posted a Spotify link for *${trackInfo.track}* by *${trackInfo.artist}* from the album *${trackInfo.album}*. :musical_note:
    \nYou can also check it out on YouTube here: ${bestMatches[0]}`
  );
});

app.command('/recommend', ({ command, ack, context, respond }) => {
  ack();

  spotify.search(
    {
      type: 'track',
      query: command.text,
      limit: SEARCH_LIMIT,
    },
    async (err, data) => {
      if (err) {
        await app.client.chat.postEphemeral({
          token: context.botToken,
          text: `I couldn't find any results for "${command.text}" because an error occurred: ${err}.`,
          user: command.user_id,
          channel: command.channel_id,
        });
      }

      if (data && data.tracks) {
        const blocks = formatSpotifySearchResults(data, command.text);
        postResults(respond, blocks);
      }
    }
  );
});

app.action('song_select_button', async ({ body, action, ack, respond }) => {
  // Acknowledge the action
  const { user } = body;
  ack();

  respond({
    response_type: 'in_channel',
    text: `<@${user.id}> recommends: ${action.value}`,
    replace_original: true,
    delete_original: true,
  });
});

app.action('next_results', async ({ action, ack, respond }) => {
  ack();

  try {
    const data = await spotify.request(action.value);
    const blocks = formatSpotifySearchResults(data);
    postResults(respond, blocks);
  } catch (e) {
    respond({
      response_type: 'ephemeral',
      text: `Uh oh! An error occured: ${e}`,
    });
  }
});

app.action('previous_results', async ({ action, ack, respond }) => {
  ack();

  try {
    const data = await spotify.request(action.value);
    const blocks = formatSpotifySearchResults(data);
    postResults(respond, blocks);
  } catch (e) {
    respond({
      response_type: 'ephemeral',
      text: `Uh oh! An error occured: ${e}`,
    });
  }
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log(`⚡️ Bolt app is running on port ${process.env.PORT} !`);
})();
