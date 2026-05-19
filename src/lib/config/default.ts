/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: design/reference/widgets/*.yml
 * Regenerate: `pnpm migrate:default-config`
 */

import type { DashboardConfig } from './schema';

export const DEFAULT_CONFIG: DashboardConfig = {
  title: 'frontdoor',
  version: '1.0',
  grid: {
    columns: 4,
  },
  theme: 'dark',
  sections: [
    {
      id: 'arrive',
      title: 'Good Morning',
      subtitle: 'pause before you begin',
      widgets: [
        {
          type: 'text',
          title: 'Stoic',
          color: 'violet',
          icon: '◆',
          span: 1,
          source: 'stoic',
        },
        {
          type: 'text',
          title: 'Quote of the Day',
          color: 'amber',
          icon: '❝',
          span: 1,
          source: 'quote',
        },
        {
          type: 'text',
          title: 'On This Day',
          color: 'cyan',
          icon: '◷',
          span: 1,
          source: 'onthisday',
        },
        {
          type: 'text',
          title: 'Word of the Day',
          color: 'green',
          icon: 'Aa',
          span: 1,
          source: 'word',
        },
      ],
    },
    {
      id: 'act',
      title: 'Launch Pad',
      subtitle: 'tools & briefings',
      widgets: [
        {
          type: 'links',
          title: 'Morning',
          color: 'amber',
          icon: '◑',
          span: 1,
          links: [
            {
              name: 'Reuters',
              url: 'https://reuters.com',
              tag: 'news',
            },
            {
              name: 'Wall Street Journal',
              url: 'https://wsj.com',
              key: 'ws',
              tag: 'news',
            },
            {
              name: 'New York Times',
              url: 'https://nytimes.com',
              key: 'ny',
              tag: 'news',
            },
            {
              name: 'Washington Post',
              url: 'https://washingtonpost.com',
              key: 'wp',
              tag: 'news',
            },
            {
              name: 'Morning Brew',
              url: 'https://www.morningbrew.com/daily',
              tag: 'news',
            },
            {
              name: 'TLDR Newsletter',
              url: 'https://tldr.tech',
              tag: 'tech',
            },
            {
              name: 'The Rundown AI',
              url: 'https://www.therundown.ai',
              tag: 'ai',
            },
            {
              name: 'HBR Daily',
              url: 'https://hbr.org/the-daily',
              tag: 'biz',
            },
            {
              name: 'Finviz',
              url: 'https://finviz.com/map.ashx',
              tag: 'finance',
            },
            {
              name: 'Bloomberg',
              url: 'https://bloomberg.com',
              tag: 'finance',
            },
          ],
        },
        {
          type: 'weather',
          title: 'Weather',
          color: 'blue',
          icon: '◈',
          span: 1,
          // lat/lon intentionally omitted (#105) — resolved at render time
          // via user.lat/lon → Vercel edge geo → hardcoded fallback. Set
          // explicitly only if you want a per-widget location override
          // (e.g. multiple weather widgets at different cities).
        },
        {
          type: 'headlines',
          title: 'Top Stories',
          color: 'amber',
          icon: '▤',
          span: 1,
          count: 7,
          feeds: [
            {
              url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
              name: 'NYT',
            },
            {
              url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
              name: 'BBC',
            },
            {
              url: 'https://feeds.npr.org/1001/rss.xml',
              name: 'NPR',
            },
          ],
        },
        {
          type: 'headlines',
          title: 'Tech & AI',
          color: 'violet',
          icon: '▤',
          span: 1,
          count: 7,
          feeds: [
            {
              url: 'https://feeds.arstechnica.com/arstechnica/index',
              name: 'Ars',
            },
            {
              url: 'https://www.theverge.com/rss/index.xml',
              name: 'Verge',
            },
            {
              url: 'https://techcrunch.com/feed/',
              name: 'TC',
            },
            {
              url: 'https://blog.google/technology/ai/rss/',
              name: 'Google AI',
            },
            {
              url: 'https://openai.com/blog/rss.xml',
              name: 'OpenAI',
            },
            {
              url: 'https://huggingface.co/blog/feed.xml',
              name: 'HF',
            },
          ],
        },
        {
          type: 'launcher',
          title: 'Apps',
          color: 'cyan',
          icon: '⊞',
          span: 4,
          columns: 12,
          apps: [
            {
              name: 'ChatGPT',
              url: 'https://chat.openai.com',
              key: 'cg',
            },
            {
              name: 'Claude',
              url: 'https://claude.ai',
              key: 'cl',
            },
            {
              name: 'Gemini',
              url: 'https://gemini.google.com',
              key: 'gn',
            },
            {
              name: 'Perplexity',
              url: 'https://perplexity.ai',
              key: 'px',
            },
            {
              name: 'Midjourney',
              url: 'https://midjourney.com',
            },
            {
              name: 'Hugging Face',
              url: 'https://huggingface.co',
            },
            {
              name: 'Gmail',
              url: 'https://mail.google.com',
              key: 'gm',
            },
            {
              name: 'Calendar',
              url: 'https://calendar.google.com',
              key: 'gc',
            },
            {
              name: 'Drive',
              url: 'https://drive.google.com',
              key: 'gd',
            },
            {
              name: 'Docs',
              url: 'https://docs.google.com',
            },
            {
              name: 'Sheets',
              url: 'https://sheets.google.com',
            },
            {
              name: 'Photos',
              url: 'https://photos.google.com',
            },
            {
              name: 'GitHub',
              url: 'https://github.com',
              key: 'gh',
            },
            {
              name: 'VS Code',
              url: 'https://vscode.dev',
            },
            {
              name: 'Notion',
              url: 'https://notion.so',
              key: 'nt',
            },
            {
              name: 'Stack Overflow',
              url: 'https://stackoverflow.com',
            },
            {
              name: 'Figma',
              url: 'https://figma.com',
            },
            {
              name: 'Vercel',
              url: 'https://vercel.com',
            },
            {
              name: 'Slack',
              url: 'https://app.slack.com',
              key: 'sl',
            },
            {
              name: 'Discord',
              url: 'https://discord.com/app',
            },
            {
              name: 'WhatsApp',
              url: 'https://web.whatsapp.com',
            },
            {
              name: 'Zoom',
              url: 'https://zoom.us',
            },
            {
              name: 'Teams',
              url: 'https://teams.microsoft.com',
            },
            {
              name: 'Telegram',
              url: 'https://web.telegram.org',
            },
            {
              name: 'YouTube',
              url: 'https://youtube.com',
              key: 'yt',
            },
            {
              name: 'Spotify',
              url: 'https://open.spotify.com',
            },
            {
              name: 'Twitter / X',
              url: 'https://x.com',
            },
            {
              name: 'Reddit',
              url: 'https://reddit.com',
              key: 'rd',
            },
            {
              name: 'Netflix',
              url: 'https://netflix.com',
            },
            {
              name: 'Twitch',
              url: 'https://twitch.tv',
            },
            {
              name: 'LinkedIn',
              url: 'https://linkedin.com',
            },
            {
              name: 'Maps',
              url: 'https://maps.google.com',
            },
            {
              name: 'Translate',
              url: 'https://translate.google.com',
            },
            {
              name: 'Amazon',
              url: 'https://amazon.com',
            },
            {
              name: 'Dropbox',
              url: 'https://dropbox.com',
            },
            {
              name: '1Password',
              url: 'https://my.1password.com',
            },
          ],
        },
      ],
    },
    {
      id: 'reward',
      title: "Today's View",
      subtitle: 'a moment of beauty',
      widgets: [
        {
          type: 'image',
          title: 'NASA - Picture of the Day',
          color: 'blue',
          icon: '✦',
          span: 2,
          source: 'nasa-apod',
        },
        {
          type: 'image',
          title: 'Bing - Daily',
          color: 'cyan',
          icon: '◻',
          span: 2,
          source: 'bing-daily',
        },
      ],
    },
    {
      id: 'read',
      title: 'The Feed',
      subtitle: 'daily & weekly reads',
      widgets: [
        {
          type: 'links',
          title: 'Daily',
          color: 'cyan',
          icon: '◇',
          span: 1,
          links: [
            {
              name: 'Hacker News',
              url: 'https://news.ycombinator.com',
              key: 'hn',
              tag: 'tech',
            },
            {
              name: 'Ars Technica',
              url: 'https://arstechnica.com',
              tag: 'tech',
            },
            {
              name: 'Anthropic Blog',
              url: 'https://anthropic.com/blog',
              tag: 'ai',
            },
            {
              name: 'OpenAI Blog',
              url: 'https://openai.com/blog',
              tag: 'ai',
            },
            {
              name: 'The Batch (deeplearning.ai)',
              url: 'https://www.deeplearning.ai/the-batch/',
              tag: 'ai',
            },
            {
              name: 'Financial Times',
              url: 'https://ft.com',
              tag: 'finance',
            },
            {
              name: 'CNBC',
              url: 'https://cnbc.com',
              tag: 'finance',
            },
            {
              name: 'Matt Levine (Bloomberg)',
              url: 'https://www.bloomberg.com/opinion/authors/ARbTQlRLRjE/matthew-s-levine',
              tag: 'finance',
            },
            {
              name: 'Seeking Alpha',
              url: 'https://seekingalpha.com',
              tag: 'finance',
            },
            {
              name: 'Business Insider',
              url: 'https://businessinsider.com',
              tag: 'biz',
            },
          ],
        },
        {
          type: 'links',
          title: 'Weekly',
          color: 'blue',
          icon: '◳',
          span: 1,
          links: [
            {
              name: 'The Economist',
              url: 'https://economist.com',
              tag: 'news',
            },
            {
              name: 'The Atlantic',
              url: 'https://theatlantic.com',
              tag: 'news',
            },
            {
              name: 'Harvard Business Review',
              url: 'https://hbr.org',
              tag: 'biz',
            },
            {
              name: 'Wired',
              url: 'https://wired.com',
              tag: 'tech',
            },
            {
              name: 'Scientific American',
              url: 'https://scientificamerican.com',
              tag: 'tech',
            },
            {
              name: 'Stratechery',
              url: 'https://stratechery.com',
              tag: 'biz',
            },
            {
              name: "Simon Willison's Blog",
              url: 'https://simonwillison.net',
              tag: 'ai',
            },
            {
              name: 'Benedict Evans',
              url: 'https://www.ben-evans.com',
              tag: 'tech',
            },
            {
              name: 'Latent Space',
              url: 'https://www.latent.space',
              tag: 'ai',
            },
            {
              name: "Lenny's Newsletter",
              url: 'https://www.lennysnewsletter.com',
              tag: 'tech',
            },
          ],
        },
        {
          type: 'headlines',
          title: 'Econ & Finance',
          color: 'green',
          icon: '▤',
          span: 1,
          count: 6,
          feeds: [
            {
              url: 'https://fredblog.stlouisfed.org/feed/',
              name: 'FRED',
            },
            {
              url: 'https://www.brookings.edu/feed/',
              name: 'Brookings',
            },
            {
              url: 'https://marginalrevolution.com/feed',
              name: 'MR',
            },
            {
              url: 'https://www.economist.com/finance-and-economics/rss.xml',
              name: 'Economist',
            },
            {
              url: 'https://voxeu.org/rss.xml',
              name: 'VoxEU',
            },
          ],
        },
        {
          type: 'headlines',
          title: 'Business Strategy',
          color: 'amber',
          icon: '▤',
          span: 1,
          count: 6,
          feeds: [
            {
              url: 'https://stratechery.com/feed/',
              name: 'Stratechery',
            },
            {
              url: 'https://www.wired.com/feed/rss',
              name: 'Wired',
            },
            {
              url: 'https://www.fastcompany.com/rss',
              name: 'FastCo',
            },
            {
              url: 'https://www.forbes.com/innovation/feed/',
              name: 'Forbes',
            },
          ],
        },
      ],
    },
    {
      id: 'discover',
      title: 'Rabbit Holes',
      subtitle: 'when you have time to explore',
      widgets: [
        {
          type: 'links',
          title: 'Monthly',
          color: 'violet',
          icon: '◈',
          span: 1,
          links: [
            {
              name: 'a16z Blog',
              url: 'https://a16z.com/blog',
              tag: 'tech',
            },
            {
              name: 'Sequoia Articles',
              url: 'https://www.sequoiacap.com/articles',
              tag: 'tech',
            },
            {
              name: 'McKinsey Insights',
              url: 'https://mckinsey.com/featured-insights',
              tag: 'biz',
            },
            {
              name: 'State of AI Report',
              url: 'https://www.stateof.ai',
              tag: 'ai',
            },
            {
              name: 'Arxiv - Recent AI',
              url: 'https://arxiv.org/list/cs.AI/recent',
              tag: 'ai',
            },
            {
              name: 'Transformer Circuits',
              url: 'https://transformer-circuits.pub',
              tag: 'ai',
            },
            {
              name: 'Product Hunt',
              url: 'https://producthunt.com',
              tag: 'tech',
            },
            {
              name: 'GitHub Trending',
              url: 'https://github.com/trending',
              tag: 'dev',
            },
            {
              name: "There's An AI For That",
              url: 'https://theresanaiforthat.com',
              tag: 'ai',
            },
            {
              name: 'Hacker News - Show HN',
              url: 'https://news.ycombinator.com/show',
              tag: 'tech',
            },
            {
              name: 'BCG Henderson Institute',
              url: 'https://www.bcg.com/henderson-institute',
              tag: 'biz',
            },
            {
              name: 'Bain Insights',
              url: 'https://www.bain.com/insights',
              tag: 'biz',
            },
            {
              name: 'Y Combinator Blog',
              url: 'https://www.ycombinator.com/blog',
              tag: 'biz',
            },
            {
              name: 'Investor Letters (Macro)',
              url: 'https://www.bridgewater.com/research-and-insights',
              tag: 'finance',
            },
            {
              name: 'CBInsights',
              url: 'https://www.cbinsights.com/research',
              tag: 'biz',
            },
          ],
        },
        {
          type: 'text',
          title: 'Wikipedia Featured',
          color: 'blue',
          icon: 'W',
          span: 1,
          source: 'wikipedia',
        },
        {
          type: 'headlines',
          title: 'Science',
          color: 'cyan',
          icon: '▤',
          span: 1,
          count: 5,
          feeds: [
            {
              url: 'https://www.nature.com/nature.rss',
              name: 'Nature',
            },
            {
              url: 'https://www.science.org/rss/news_current.xml',
              name: 'Science',
            },
            {
              url: 'https://www.quantamagazine.org/feed/',
              name: 'Quanta',
            },
            {
              url: 'https://www.newscientist.com/feed/home/',
              name: 'NewSci',
            },
          ],
        },
        {
          type: 'headlines',
          title: 'Papers & Ideas',
          color: 'blue',
          icon: '▤',
          span: 1,
          count: 5,
          feeds: [
            {
              url: 'https://ncase.me/feed.xml',
              name: 'Ncase',
            },
            {
              url: 'https://www.lesswrong.com/feed.xml',
              name: 'LessWrong',
            },
            {
              url: 'https://distill.pub/rss.xml',
              name: 'Distill',
            },
            {
              url: 'https://arxiv.org/rss/cs.AI',
              name: 'arXiv AI',
            },
          ],
        },
      ],
    },
    {
      id: 'depart',
      title: 'Closing Thought',
      subtitle: 'carry something with you',
      widgets: [
        {
          type: 'text',
          title: 'Poem',
          color: 'rose',
          icon: '¶',
          span: 2,
          source: 'poem',
        },
        {
          type: 'image',
          title: 'Wikimedia - Photo',
          color: 'green',
          icon: '◻',
          span: 2,
          source: 'wikimedia-potd',
        },
      ],
    },
  ],
};
