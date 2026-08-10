# Applying the Gemini AI Provider Refactor

Because this execution container runs in a strict security sandbox that prohibits outgoing HTTPS/SSH credential resolution (terminal prompts disabled, no PAT available), the final Gemini configuration cannot be directly pushed to the GitHub repository.

The exact changes for the \`GeminiAIProvider\` refactor have been compiled into a patch.

## Instructions
1. Retrieve \`GEMINI_QA.patch\` from the container artifact workspace.
2. Checkout the \`jules-qa-benchmark\` or \`main\` branch locally.
3. Apply the patch:
   \`git apply GEMINI_QA.patch\`
4. Commit the changes and push your branch:
   \`git checkout -b jules-qa-gemini\`
   \`git commit -a -m "feat(ai): Replace provider with Gemini Structured Tool Calling"\`
   \`git push -u origin jules-qa-gemini\`
