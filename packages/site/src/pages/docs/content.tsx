import type { ReactNode } from "react";
import { Link } from "react-router";

import { APP_HOST, APP_URL } from "../../lib/links";

// The docs, one entry per page. Each page is split into sections; the section titles build the
// "On this page" list. Keep claims in step with the app: see packages/web/src/types/settings.ts
// for settings names.

export interface DocSection {
  id: string;
  title: string;
  body: ReactNode;
}

export interface DocPage {
  slug: string;
  group: string;
  title: string;
  lead: string;
  sections: DocSection[];
}

function Note({ children }: { children: ReactNode }): ReactNode {
  return <p className="doc-note">{children}</p>;
}

function Code({ children }: { children: string }): ReactNode {
  return (
    <pre>
      <code>{children}</code>
    </pre>
  );
}

export const DOCS: DocPage[] = [
  {
    slug: "overview",
    group: "Get started",
    title: "Overview",
    lead: "Memora is a learning workspace that lives in your browser. It keeps your files, turns recordings into transcripts, and helps you find and understand what you've collected.",
    sections: [
      {
        id: "what-it-is",
        title: "What Memora is",
        body: (
          <>
            <p>
              Memora is a web app for the material you study from: lecture recordings, papers,
              slides, photos of the whiteboard, and your own notes. You add files once, and Memora
              makes them searchable, transcribes what can be heard, and lets you ask questions about
              all of it.
            </p>
            <p>
              There is no account and nothing to install. Open <a href={APP_URL}>{APP_HOST}</a> and
              start adding files.
            </p>
          </>
        ),
      },
      {
        id: "the-app",
        title: "Finding your way around",
        body: (
          <>
            <p>The sidebar has four places:</p>
            <ul>
              <li>
                <b>Home</b>: your dashboard of widgets. See{" "}
                <Link to="/docs/home">Home and widgets</Link>.
              </li>
              <li>
                <b>Transcription</b>: live recording and your transcript history. See{" "}
                <Link to="/docs/transcription">Transcription</Link>.
              </li>
              <li>
                <b>Chat</b>: conversations with the assistant about your files. See{" "}
                <Link to="/docs/chat">Chat</Link>.
              </li>
              <li>
                <b>Desktop</b>: your files and folders. See{" "}
                <Link to="/docs/desktop">Desktop and files</Link>.
              </li>
            </ul>
            <p>
              Press <kbd>⌘</kbd> <kbd>K</kbd> anywhere to jump to a page, run an action, or search
              your library.
            </p>
          </>
        ),
      },
      {
        id: "where-data-lives",
        title: "Where your data lives",
        body: (
          <>
            <p>
              Your library is stored in your browser's private file system (OPFS), on your device.
              It stays there between visits and works offline. Nothing is uploaded to a Memora
              server.
            </p>
            <p>
              Speech recognition runs on your device once its model is downloaded. Chat uses a cloud
              model from a provider you connect with your own API key; only the requests you make in
              chat, and the context they need, are sent to that provider.
            </p>
            <Note>
              Because everything is stored in the browser, clearing this site's data in your browser
              settings deletes your library.
            </Note>
          </>
        ),
      },
    ],
  },
  {
    slug: "getting-started",
    group: "Get started",
    title: "Getting started",
    lead: "Open the app, download a speech model, add a few files, and connect a provider for chat.",
    sections: [
      {
        id: "open",
        title: "Open Memora",
        body: (
          <>
            <p>
              Go to <a href={APP_URL}>{APP_HOST}</a> in a recent Chrome, Edge, or Safari on a
              computer. Local models run fastest in browsers with WebGPU.
            </p>
          </>
        ),
      },
      {
        id: "install",
        title: "Install it as an app",
        body: (
          <>
            <p>
              Memora is a progressive web app (PWA), so you can install it like any other app. It
              then opens in its own window, launches from your dock or Start menu, and works offline
              with the models you've downloaded.
            </p>
            <ul>
              <li>
                <b>Chrome or Edge</b>: click the install icon at the right of the address bar, or
                open the browser menu and choose to install Memora.
              </li>
              <li>
                <b>Safari on Mac</b>: choose <b>File → Add to Dock</b>.
              </li>
              <li>
                <b>Safari on iPhone or iPad</b>: tap <b>Share</b>, then <b>Add to Home Screen</b>.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "first-run",
        title: "The first run",
        body: (
          <>
            <p>The first time you open Memora, a short setup walks you through:</p>
            <ol>
              <li>Telling Memora how to address you. You can change this later in Settings.</li>
              <li>
                Choosing a speech model. Fast models respond quicker; accurate models take longer
                but catch more detail. The model downloads once and is kept for offline use.
              </li>
              <li>
                Trying live transcription, then playing the recording back with its transcript.
              </li>
            </ol>
          </>
        ),
      },
      {
        id: "add-files",
        title: "Add your first files",
        body: (
          <p>
            Open <b>Desktop</b> and drag files onto it, or choose <b>Upload file</b>. Start with a
            lecture recording and the reading that goes with it. More in{" "}
            <Link to="/docs/desktop">Desktop and files</Link>.
          </p>
        ),
      },
      {
        id: "connect-provider",
        title: "Connect a provider for chat",
        body: (
          <>
            <p>
              Chat runs on a cloud model, so it needs a provider. Open <b>Settings → Providers</b>,
              add the provider's base URL and your API key, then pick it for Chat in{" "}
              <b>Settings → Models by feature</b>.
            </p>
            <Note>Your API key is stored only on this device.</Note>
          </>
        ),
      },
    ],
  },
  {
    slug: "desktop",
    group: "Using Memora",
    title: "Desktop and files",
    lead: "Desktop is where you keep and organize everything you add to Memora.",
    sections: [
      {
        id: "add",
        title: "Add files",
        body: (
          <>
            <p>
              Drag files onto the Desktop, or use <b>Upload file</b>. Memora accepts audio, video,
              images, PDFs, Word documents, Markdown, and plain text.
            </p>
            <p>
              Files are copied into your library, so they stay available even if the original moves.
            </p>
          </>
        ),
      },
      {
        id: "organize",
        title: "Organize",
        body: (
          <>
            <p>
              Make folders, drag files between them, rename, and move things around the way you
              would in any file manager. Double-click a folder to open it in a window; windows can
              be moved and resized.
            </p>
            <p>Deleted files go to the Trash first, so you can restore them.</p>
          </>
        ),
      },
      {
        id: "indexing",
        title: "Indexing",
        body: (
          <>
            <p>
              After you add a file, Memora reads it in the background: it extracts text from
              documents, recognizes text in images (OCR), and builds the search index. A small
              status mark on each file shows whether it is waiting, in progress, done, or failed.
            </p>
            <p>
              You can adjust this in <b>Settings → Indexing</b>.
            </p>
          </>
        ),
      },
      {
        id: "storage",
        title: "Storage",
        body: (
          <>
            <p>
              Your files live in the browser's private file system on this device. See how much
              space they use in <b>Settings → Data Storage</b>.
            </p>
            <Note>
              Browsers can clear site data under storage pressure unless storage is marked as
              persistent. Check the persistence option in Data Storage, and keep copies of anything
              you can't lose.
            </Note>
          </>
        ),
      },
    ],
  },
  {
    slug: "transcription",
    group: "Using Memora",
    title: "Transcription",
    lead: "Record a lecture live or transcribe a file you already have. Every word keeps its timestamp.",
    sections: [
      {
        id: "live",
        title: "Record live",
        body: (
          <>
            <ol>
              <li>
                Open <b>Transcription</b> and start a live transcription.
              </li>
              <li>
                Choose the language. The first time, the speech model loads before recording starts.
              </li>
              <li>
                Words appear as they are spoken. Stop when you're done; the recording and transcript
                are saved together.
              </li>
            </ol>
          </>
        ),
      },
      {
        id: "file",
        title: "Transcribe a file",
        body: (
          <p>
            Open any audio or video file and choose <b>Auto transcribe</b>. If the result isn't
            right, retry, or paste a transcript you already have and save it.
          </p>
        ),
      },
      {
        id: "read",
        title: "Read along",
        body: (
          <p>
            The transcript follows the recording as it plays. Click any word to jump to that moment.
          </p>
        ),
      },
      {
        id: "search-export",
        title: "Search and export",
        body: (
          <p>
            Search inside a transcript and step through the matches; each one jumps to its moment.
            Export the transcript as plain text or as SRT subtitles.
          </p>
        ),
      },
      {
        id: "model",
        title: "Choose a speech model",
        body: (
          <p>
            In <b>Settings → Models by feature</b>, Transcription can run on this device (Nemotron
            3.5 ASR or Whisper Base) or with a cloud provider. Downloaded models are listed under{" "}
            <b>Settings → Local Models</b>.
          </p>
        ),
      },
    ],
  },
  {
    slug: "search",
    group: "Using Memora",
    title: "Search",
    lead: "One search box for pages, actions, files, chats, and what's inside your files.",
    sections: [
      {
        id: "open",
        title: "Open search",
        body: (
          <p>
            Press <kbd>⌘</kbd> <kbd>K</kbd> (<kbd>Ctrl</kbd> <kbd>K</kbd> on Windows and Linux) from
            anywhere in the app.
          </p>
        ),
      },
      {
        id: "what",
        title: "What it finds",
        body: (
          <ul>
            <li>Pages: Home, Transcription, Chat, and Desktop.</li>
            <li>
              Actions: new chat, start live transcription, upload a file, new folder, open the
              Trash.
            </li>
            <li>Files and folders by name, and your past chats.</li>
            <li>Content inside indexed files, matched by meaning as well as by words.</li>
          </ul>
        ),
      },
    ],
  },
  {
    slug: "chat",
    group: "Using Memora",
    title: "Chat",
    lead: "Ask questions about your own material. Answers point back to where they came from.",
    sections: [
      {
        id: "start",
        title: "Start a conversation",
        body: (
          <p>
            Open <b>Chat</b> and type in <b>Message Memora</b>. Each conversation is saved; open the
            history panel to go back to one. Chat needs a provider; see{" "}
            <Link to="/docs/models">Models and providers</Link>.
          </p>
        ),
      },
      {
        id: "references",
        title: "Point it at your files",
        body: (
          <p>
            Add files or folders as references so the answer draws on them, and attach images from
            your library. When an answer cites a recording, it shows a card that opens the recording
            at the right moment.
          </p>
        ),
      },
      {
        id: "while-working",
        title: "While it works",
        body: (
          <>
            <p>
              You can watch the steps Memora takes. Before it writes to your files, it asks for your
              approval.
            </p>
            <p>
              If you send a message while it's busy, choose how it's delivered: <b>Pending</b> waits
              until the current task ends; <b>Steer</b> joins the current task before its next step.
              You can also stop the task.
            </p>
          </>
        ),
      },
      {
        id: "personalization",
        title: "Personalization",
        body: (
          <p>
            In <b>Settings → Personalization</b>, set how Memora addresses and responds to you, and
            review the things it has remembered.
          </p>
        ),
      },
    ],
  },
  {
    slug: "home",
    group: "Using Memora",
    title: "Home and widgets",
    lead: "Home is your dashboard. Keep the built-in widgets, or describe new ones in chat.",
    sections: [
      {
        id: "home",
        title: "Your Home",
        body: (
          <p>
            Home starts with three widgets: a calendar, your recent files, and a to-do list. Reorder
            them to suit you.
          </p>
        ),
      },
      {
        id: "make",
        title: "Make a widget in chat",
        body: (
          <ol>
            <li>
              In Chat, describe what you want: "a reading tracker for this week", "a focus timer".
            </li>
            <li>Memora builds it right in the conversation, so you can try it.</li>
            <li>Save it, and add it to Home.</li>
          </ol>
        ),
      },
      {
        id: "data",
        title: "What widgets can see",
        body: (
          <>
            <p>
              Widgets made in chat run in an isolated frame. They can't read your library on their
              own; they only receive data from a named source, such as recent files, to-do progress,
              storage use, or the number of saved chats.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: "models",
    group: "Configure",
    title: "Models and providers",
    lead: "Choose where each AI feature runs: on this device, or with a provider you connect.",
    sections: [
      {
        id: "by-feature",
        title: "Models by feature",
        body: (
          <>
            <p>
              <b>Settings → Models by feature</b> lists each AI feature and where it runs:
            </p>
            <ul>
              <li>
                <b>Chat</b>: always a cloud model from one of your providers.
              </li>
              <li>
                <b>Transcription</b>: on this device or cloud.
              </li>
              <li>
                <b>Session titles</b> and <b>memory</b>: on this device, cloud, or the same model as
                chat.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "local",
        title: "Local models",
        body: (
          <p>
            Local models download once and then run in your browser, offline. Available models
            include Nemotron 3.5 ASR and Whisper Base for speech, and Qwen3.5 0.8B and Gemma 4 E2B
            for text. Review what's downloaded in <b>Settings → Local Models</b>.
          </p>
        ),
      },
      {
        id: "providers",
        title: "Providers",
        body: (
          <>
            <p>
              Add a provider in <b>Settings → Providers</b> with its name, base URL, and your API
              key. Memora talks to the provider directly from your browser.
            </p>
            <Note>
              API keys stay on this device. Only requests for features you route to a provider leave
              it.
            </Note>
          </>
        ),
      },
    ],
  },
  {
    slug: "self-deployment",
    group: "Host it yourself",
    title: "Self-deployment",
    lead: "Memora is a single-page app, so you can deploy it wherever static sites are hosted.",
    sections: [
      {
        id: "requirements",
        title: "What you need",
        body: (
          <ul>
            <li>Node.js 20 or later</li>
            <li>pnpm</li>
            <li>Vite+</li>
          </ul>
        ),
      },
      {
        id: "build",
        title: "Build settings",
        body: (
          <>
            <p>Two settings are all a host needs:</p>
            <ul>
              <li>
                Build command: <code>pnpm run build</code>
              </li>
              <li>
                Output directory: <code>packages/web/dist</code>
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "cloudflare-pages",
        title: "Example: Cloudflare Pages",
        body: (
          <p>
            {APP_HOST} runs on Cloudflare Pages. Connect the repository, enter the build command and
            output directory above, and deploy.
          </p>
        ),
      },
    ],
  },
  {
    slug: "develop",
    group: "Host it yourself",
    title: "Develop locally",
    lead: "Run Memora from source to try changes or contribute.",
    sections: [
      {
        id: "run",
        title: "Run the app",
        body: (
          <>
            <Code>{`git clone https://github.com/MaxtuneLee/memora.git
cd memora
pnpm i
pnpm dev`}</Code>
            <p>
              The app starts at <code>localhost:9003</code>.
            </p>
          </>
        ),
      },
      {
        id: "commands",
        title: "Useful commands",
        body: (
          <Code>{`pnpm build      # production build of the app
pnpm test:web   # tests
pnpm lint:web   # lint`}</Code>
        ),
      },
      {
        id: "layout",
        title: "Where things are",
        body: (
          <ul>
            <li>
              <code>packages/web</code>: the app.
            </li>
            <li>
              <code>packages/ai-core</code>, <code>packages/ai-provider</code>: the assistant and
              model providers.
            </li>
            <li>
              <code>packages/local-model-runtime</code>: speech and text models in the browser.
            </li>
            <li>
              <code>packages/fs</code>: file storage.
            </li>
            <li>
              <code>packages/site</code>: this website.
            </li>
          </ul>
        ),
      },
    ],
  },
];
