'use strict';
// Explicit naive RED subject: it repeats the insufficient "all closed" assumption.
function problems(observation){
  return observation?.closed===30?[]:['SOCKETS_NOT_CLOSED'];
}
module.exports={problems};
