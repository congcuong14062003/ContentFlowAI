import { onBeforeUnmount, watch, type Ref } from 'vue';
import { queryClient } from '../../app/query';
import { notificationStream } from '../../lib/api';

export function useNotificationStream(userId:Ref<string|undefined>){
  let controller:AbortController|undefined;let timer:ReturnType<typeof setTimeout>|undefined;let attempts=0;
  function stop(){controller?.abort();controller=undefined;if(timer)clearTimeout(timer);timer=undefined;}
  async function connect(){if(!userId.value||controller)return;controller=new AbortController();const signal=controller.signal;
    try{await notificationStream(signal,name=>{if(name==='ready'||name==='notification'||name==='reset'){attempts=0;void queryClient.invalidateQueries({queryKey:['notifications']});void queryClient.invalidateQueries({queryKey:['notifications-count']});if(name==='reset')void queryClient.invalidateQueries({queryKey:['members']});}});}catch{ /* reconnect after bounded backoff */ }
    if(signal.aborted)return;controller=undefined;const delay=Math.min(30000,1000*2**Math.min(attempts++,5));timer=setTimeout(()=>{void connect();},delay);
  }
  watch(userId,()=>{stop();if(userId.value)void connect();},{immediate:true});
  onBeforeUnmount(stop);
}
