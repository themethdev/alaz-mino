export default function Pointer(){
    return       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-44 h-44">
          <div className="absolute inset-0 rounded-full border border-white/30" />
          <div className="absolute inset-[22%] rounded-full border border-white/20" />
          <div className="absolute inset-[44%] rounded-full border border-white/15" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-px bg-white/15" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-full w-px bg-white/15" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center">
              <div className="w-10 h-px bg-white/60" />
              <div className="w-2 h-2 rounded-full bg-white/80 mx-1" />
              <div className="w-10 h-px bg-white/60" />
            </div>
          </div>
          <div className="absolute -top-5 left-1/2 -translate-x-1/2">
            <div className="w-px h-4 bg-white/30" />
          </div>
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2">
            <div className="w-px h-4 bg-white/30" />
          </div>
          <div className="absolute top-1/2 -left-5 -translate-y-1/2">
            <div className="h-px w-4 bg-white/30" />
          </div>
          <div className="absolute top-1/2 -right-5 -translate-y-1/2">
            <div className="h-px w-4 bg-white/30" />
          </div>
        </div>
      </div>
}