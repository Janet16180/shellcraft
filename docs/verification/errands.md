# Chapter 20, Background Tasks: checked in real bash

Every job-control claim of the lesson (`&` printing `[1] PID`, `jobs` with Running/Stopped and the
`+` mark, Ctrl+Z giving `[1]+  Stopped`, `bg` printing `[2]+ sleep 100 &`, `fg` then Ctrl+C
printing `^C`, `kill %1` and the `Terminated` notice, `Done` before the next prompt, `kill 1` taking
a PID) was checked by hand in the Docker image `shellcraft-difftest` with `bash -i` and is logged,
with the exact outputs, in docs/verification/jobs.md (engine work, slice/jobs).
