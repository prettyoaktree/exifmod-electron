# TODO

# Refactor film metadata

We are running into a lot of issues and edge cases with the way film identification currently works. One the one hand, putting film stock in keywords is great for visibility and searchability later on (e.g. in Apple Photos, Google Photos, or Lightroom). However, it also creates significant complexity because EXIF keywords can represent multiple things (film stocks, actual keywords), which creates a ambiguity, which creates lots of bugs.

I would like to rethink the approach and see if we can create an implementation plan that will satisfy all of the requirements below:

1. Film identification is critical. It must be written to EXIF (orig file or sidecar)
2. Searchability after the fact is critical. We know photo libraries index image description and keywords. They do not typically index UserComments (verified with Apple Photos... it ignores it).
3. If we overload film into a field that also serves a different purpose (e.g. kewords, description), it cannot create significant complexity and bugs in the system. 

