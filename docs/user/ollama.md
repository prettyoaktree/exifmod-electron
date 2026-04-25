# Ollama and AI

If you want to get descriptions and keyword ideas from an image, EXIFmod can use a local AI model to generate them for you (nothing is sent to a random cloud!) That’s done with [Ollama](https://ollama.com/) — a nifty app that many smart people (like you!) use to run AI models on their own machines.

Out of the box, EXIFmod expects a model called `gemma4`, which is made by Google, and is tuned for a good mix of image understanding and speed on typical hardware. You can experiment with other models (see below), but things will probably break because the amount of testing that was done with other models is exactly zero.

## 1. Install Ollama

- Any platform: get the installer from [ollama.com](https://ollama.com/) and follow their steps.
- Mac with Homebrew: you can also run:
  ```bash
  brew install ollama
  ```

Ollama needs to be running on your machine for EXIFmod to be able to talk to it. If the app finds the `ollama` app but the server isn’t up, you may get a nudge to start it — you can also run `ollama serve` yourself in a terminal if you like doing things by hand.

## 2. Pull the default model

In a terminal:

```bash
ollama pull gemma4
```

That command downloads the model EXIFmod was actually tested with. The first download can take a while and can be large (several gigs). It might be worth it, even just for the giggles.

## 3. Using AI inside EXIFmod

Once Ollama is up and the model is pulled, use the in-app AI button (it looks kinda sparkly) to generate or refine descriptions and keywords from the current image. If the wording feels too short, too long, too generic, or too specific, you can adjust the system prompt in the app...  **carefully!** — a bad prompt can make the output sound like a furniture catalog (not a bad thing if you photograph for a furniture catalog... but not everyone does). If you break it, EXIFmod can reset the system prompt to the default. Phew!

## Advanced stuff

You usually don’t need this.

- If you use a different model name, you can set the environment variable `EXIFMOD_OLLAMA_MODEL` before starting EXIFmod.
- If Ollama listens on a non-default host or port, use `EXIFMOD_OLLAMA_HOST`.

Only change these if you know why you’re changing them. Everyone else is fine with the defaults above. Also, while you are welcome to try this, it will probably not work (system prompts may need to be tuned per model and the developer did not have time to do this).