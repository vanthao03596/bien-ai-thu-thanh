from px import P, hx
from chars import Humanoid

def goblin():
    return Humanoid(fw=32, fh=32, ground=30, leg_len=4, leg_w=2.2, torso_w=6, torso_h=5, head_rx=4.2, head_ry=3.6,
                    arm_len=4, arm_w=2, skin='goblin', shirt='leather', pants='furb', boots='leather', feat='goblin',
                    weapon='dagger', stride=2, eye=hx('#ffd23a'))

def orc():
    return Humanoid(fw=32, fh=32, ground=30, leg_len=6, leg_w=3, torso_w=9, torso_h=8, head_rx=4.0, head_ry=3.8,
                    arm_len=6, arm_w=3, skin='orc', shirt='leather', pants='furb', boots='leather', feat='orc', armor='vest',
                    weapon='axe', stride=2.6, eye=hx('#ff3a2a'), hunch=1, pauldron='metal')

def skeleton():
    return Humanoid(fw=32, fh=32, ground=30, leg_len=5, leg_w=1.8, torso_w=6, torso_h=6, head_rx=3.6, head_ry=3.4,
                    arm_len=5, arm_w=1.6, skin='bone', shirt='bone', pants='bone', boots='bone', feat='skull', armor='ribs',
                    weapon='sword', shield='round', belt=None, stride=2.4)

def shaman():
    return Humanoid(fw=32, fh=32, ground=30, leg_len=4, leg_w=2.2, torso_w=7, torso_h=6, head_rx=4.0, head_ry=3.5,
                    arm_len=4, arm_w=2, skin='goblin', shirt='purple', pants='purple', boots='leather', feat='goblin',
                    helmet='hood_p', armor='robe', weapon='staff', belt='gold', stride=1.8, eye=hx('#ffd23a'))

def dark_knight():
    return Humanoid(fw=32, fh=32, ground=30, leg_len=6, leg_w=2.8, torso_w=8, torso_h=8, head_rx=3.8, head_ry=3.6,
                    arm_len=5.5, arm_w=2.6, skin='skin', shirt='dark', pants='dark', boots='dark', feat='human',
                    helmet='dark', armor='plate_k', weapon='sword', shield='kite_k', cape='darkred', plume='red',
                    pauldron='dark', stride=2.4)

def ogre():
    return Humanoid(fw=48, fh=48, ground=46, leg_len=8, leg_w=5, torso_w=16, torso_h=13, head_rx=5.0, head_ry=4.6,
                    arm_len=9, arm_w=4.6, skin='ogre', shirt='ogre', pants='leather', boots='ogre', feat='ogre', belly=True,
                    weapon='club', wscale=1.45, stride=3.4, s=1.5, eye=hx('#1d1322'), hunch=2, belt=None)

def demon_boss():
    return Humanoid(fw=64, fh=64, ground=61, leg_len=11, leg_w=6.5, torso_w=19, torso_h=16, head_rx=6.0, head_ry=5.6,
                    arm_len=12, arm_w=6, skin='demon', shirt='demon', pants='dark', boots='dark', feat='demon',
                    armor=None, pauldron='dark', weapon='cleaver', wscale=1.45, stride=4.5, s=2.0,
                    eye=hx('#ffd23a'), wings='demon', hunch=2, belt='gold')

def hero():
    return Humanoid(fw=32, fh=32, ground=30, leg_len=6, leg_w=2.8, torso_w=8, torso_h=8, head_rx=3.8, head_ry=3.6,
                    arm_len=5.5, arm_w=2.6, skin='skin', shirt='blue', pants='metal', boots='metal', feat='human',
                    helmet='iron', plume='blue', armor='plate_g', weapon='sword', wscale=1.1, shield='kite_b', cape='blue',
                    pauldron='metal', stride=2.4, belt='gold')

def soldier():
    return Humanoid(fw=32, fh=32, ground=30, leg_len=5, leg_w=2.6, torso_w=7, torso_h=7, head_rx=3.7, head_ry=3.5,
                    arm_len=5, arm_w=2.3, skin='skin', shirt='red', pants='leather', boots='leather', feat='human',
                    helmet='iron', weapon='sword', shield='round', stride=2.3)

ROSTER = {
    'goblin': goblin, 'orc': orc, 'skeleton': skeleton, 'shaman': shaman, 'dark_knight': dark_knight,
    'ogre': ogre, 'demon_boss': demon_boss, 'hero_paladin': hero, 'soldier': soldier,
}
