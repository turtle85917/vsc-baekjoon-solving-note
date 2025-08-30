interface SolvedacUser{
  handle:string;
  bio:string;
  tier:number;
  backgroundId:string;
  profileImageUrl:string;
}

interface SolvedacBackground{
  backgroundId:string;
  backgroundImageUrl:string;
}

interface UserInfoInWorkspace{
  user:SolvedacUser;
  background:SolvedacBackground;
  updatedAt:number;
}

type ProblemItem = [string, ...(string|ProblemInfo)[]];
interface ProblemInfo{
  problemId:string;
  problemTier:string;
  isMarathon:boolean;
  isFinishMarathon:boolean;
  metadata:string[];
}
