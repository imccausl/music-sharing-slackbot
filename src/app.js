require('dotenv').config();

const { App } = require('@slack/bolt');
const Spotify = require('node-spotify-api');

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

const SEARCH_LIMIT = 5;

/* Helper Functions
 * (will eventually be moved into separate files)
 */

/*
 * Spotify Data Parsing Helper
 */

const formatSpotifySearchResults = (command, data) => {
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
  const searchResults = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Search for "${command.text}" returned *${total}* results:`,
      },
    },
  ];

  items.forEach(result => {
    const {
      album,
      artists,
      duration,
      explicit,
      external_urls,
      name,
      id,
      popularity,
    } = result;

    searchResults.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${external_urls.spotify}|${name}>*\n<${album.external_urls.spotify}|${album.name}>\n_<${artists[0].external_urls.spotify}|${artists[0].name}>_`,
        },
        accessory: {
          type: 'image',
          image_url: album.images[1].url,
          alt_text: `${artists[0].name} ${album.name} thumbnail`,
        },
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
            value: id,
            action_id: 'song_select_button',
          },
        ],
      }
    );
  });

  return searchResults;
};

app.message('hello', ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  say(`Hey there <@${message.user}>!`);
});

app.command('/recommend', ({ command, ack, payload, context }) => {
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
        const blocks = formatSpotifySearchResults(command, data);
        await app.client.chat.postEphemeral({
          token: context.botToken,
          user: command.user_id,
          channel: command.channel_id,
          blocks,

          // user: command.user_id,
          // channel: command.channel_id,
        });
      }
    }
  );
});

app.action('song_select_button', ({ action, ack, say }) => {
  // Acknowledge the action
  ack();
  console.log(action);
  say(`clicked the button`);
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log(`⚡️ Bolt app is running on port ${process.env.PORT} !`);
})();
